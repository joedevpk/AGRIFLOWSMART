import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

interface Tools {
  parseJavaMajor(out: string): number | null;
  parseLocalProperties(text: string): Record<string, string>;
  defaultSdkDirs(platform: string, env: Record<string, string>, home: string): string[];
  resolveSdkDir(o: { platform: string; env: Record<string, string>; home: string; localProperties?: Record<string, string>; exists: (p: string) => boolean }): { dir: string | null; source: string | null };
  candidateJdkHomes(platform: string, env: Record<string, string>, home: string): string[];
  gradleInvocation(platform: string, androidDir: string, args: string[]): { command: string; args: string[]; cwd: string };
  checkSdkPackages(sdk: string, exists: (p: string) => boolean): string[];
  wrapperDistributionName(text: string): string | null;
  gradleDistributionReady(name: string | null, home: string): boolean;
  REQUIRED_JAVA_MAJOR: number; COMPILE_SDK: number; APK_DEBUG_PATH: string;
}
interface Checks { loadBuildEnv(root: string): Record<string, string>; checkEnv(e: Record<string, string | undefined>): string[]; compareWebAssets(d: string, n: string): string[] }
let t: Tools; let c: Checks;
beforeAll(async () => {
  const tools = '../../scripts/android-tools.mjs'; const checks = '../../scripts/mobile-checks.mjs'; // chemins en variables : scripts Node sans types
  t = (await import(/* @vite-ignore */ tools)) as unknown as Tools;
  c = (await import(/* @vite-ignore */ checks)) as unknown as Checks;
});
const dirs: string[] = [];
const tmp = () => { const d = mkdtempSync(join(tmpdir(), 'agri-android-')); dirs.push(d); return d; };
afterEach(() => { while (dirs.length) rmSync(dirs.pop() as string, { recursive: true, force: true }); vi.unstubAllEnvs(); });

describe('JDK', () => {
  it('lit la version majeure (formats modernes et historiques)', () => {
    expect(t.parseJavaMajor('openjdk version "21.0.4" 2024-07-16\nOpenJDK Runtime Environment')).toBe(21);
    expect(t.parseJavaMajor('java version "17.0.12" 2024-07-16 LTS')).toBe(17);
    expect(t.parseJavaMajor('openjdk version "1.8.0_392"')).toBe(8);
    expect(t.parseJavaMajor('openjdk version "21"')).toBe(21);
    expect(t.parseJavaMajor('command not found')).toBeNull();
    expect(t.parseJavaMajor('')).toBeNull();
  });
  it('JDK 21 exigé par le projet généré (Java 21 dans capacitor.build.gradle)', () => { expect(t.REQUIRED_JAVA_MAJOR).toBe(21); });
  it('cherche le JDK livré avec Android Studio sous Windows, macOS et Linux', () => {
    expect(t.candidateJdkHomes('win32', { ProgramFiles: 'C:\\Program Files' }, 'C:\\Users\\moi')[0]).toMatch(/Android Studio.jbr$/);
    expect(t.candidateJdkHomes('darwin', {}, '/Users/moi')[0]).toContain('Android Studio.app');
    expect(t.candidateJdkHomes('linux', {}, '/home/moi').some((p) => p.endsWith('jbr'))).toBe(true);
  });
});

describe('SDK Android', () => {
  it('décode android/local.properties tel qu\'Android Studio l\'écrit sous Windows', () => {
    const lp = t.parseLocalProperties('## Ce fichier est généré\r\nsdk.dir=C\\:\\\\Users\\\\moi\\\\AppData\\\\Local\\\\Android\\\\Sdk\r\n');
    expect(lp['sdk.dir']).toBe('C:\\Users\\moi\\AppData\\Local\\Android\\Sdk');
    expect(t.parseLocalProperties('# vide')).toEqual({});
  });
  it('emplacements par défaut d\'Android Studio', () => {
    expect(t.defaultSdkDirs('win32', { LOCALAPPDATA: 'C:\\Users\\moi\\AppData\\Local' }, 'C:\\Users\\moi')[0]).toMatch(/Android.Sdk$/);
    expect(t.defaultSdkDirs('darwin', {}, '/Users/moi')[0]).toBe(join('/Users/moi', 'Library', 'Android', 'sdk'));
    expect(t.defaultSdkDirs('linux', {}, '/home/moi')[0]).toBe(join('/home/moi', 'Android', 'Sdk'));
  });
  it('priorité : ANDROID_HOME, ANDROID_SDK_ROOT, local.properties, emplacement par défaut — uniquement s\'ils existent', () => {
    const exists = (set: string[]) => (p: string) => set.includes(p);
    const base = { platform: 'linux', home: '/home/moi', localProperties: { 'sdk.dir': '/lp' } };
    expect(t.resolveSdkDir({ ...base, env: { ANDROID_HOME: '/a', ANDROID_SDK_ROOT: '/b' }, exists: exists(['/a', '/b', '/lp']) })).toEqual({ dir: '/a', source: 'ANDROID_HOME' });
    expect(t.resolveSdkDir({ ...base, env: { ANDROID_HOME: '/a', ANDROID_SDK_ROOT: '/b' }, exists: exists(['/b', '/lp']) })).toEqual({ dir: '/b', source: 'ANDROID_SDK_ROOT' });
    expect(t.resolveSdkDir({ ...base, env: {}, exists: exists(['/lp']) })).toEqual({ dir: '/lp', source: 'android/local.properties' });
    expect(t.resolveSdkDir({ ...base, env: {}, exists: exists([join('/home/moi', 'Android', 'Sdk')]) }).source).toMatch(/par défaut/);
    expect(t.resolveSdkDir({ ...base, env: { ANDROID_HOME: '/fantome' }, exists: exists([]) })).toEqual({ dir: null, source: null });
  });
  it(`vérifie Platform ${35}, Platform-Tools et Build-Tools`, () => {
    expect(t.COMPILE_SDK).toBe(35);
    const sdk = tmp();
    expect(t.checkSdkPackages(sdk, () => false)).toHaveLength(3);
    mkdirSync(join(sdk, 'platforms', 'android-35'), { recursive: true }); mkdirSync(join(sdk, 'platform-tools'), { recursive: true }); mkdirSync(join(sdk, 'build-tools', '35.0.0'), { recursive: true });
    expect(t.checkSdkPackages(sdk, (p) => existsSync(p))).toEqual([]);
  });
});

describe('distribution Gradle', () => {
  it('lit le nom de distribution du wrapper', () => {
    expect(t.wrapperDistributionName('distributionUrl=https\\://services.gradle.org/distributions/gradle-8.11.1-all.zip')).toBe('gradle-8.11.1-all');
    expect(t.wrapperDistributionName('distributionUrl=https://services.gradle.org/distributions/gradle-8.9-bin.zip')).toBe('gradle-8.9-bin');
    expect(t.wrapperDistributionName('rien')).toBeNull();
  });
  it('RÉGRESSION : un dossier vide ou des fichiers .part/.lck (téléchargement échoué) ne sont pas une distribution', () => {
    const home = tmp(); const d = join(home, 'wrapper', 'dists', 'gradle-8.11.1-all', 'abc123'); mkdirSync(d, { recursive: true });
    expect(t.gradleDistributionReady('gradle-8.11.1-all', home)).toBe(false); // dossier vide
    writeFileSync(join(d, 'gradle-8.11.1-all.zip.part'), ''); writeFileSync(join(d, 'gradle-8.11.1-all.zip.lck'), '');
    expect(t.gradleDistributionReady('gradle-8.11.1-all', home)).toBe(false); // téléchargement interrompu
    writeFileSync(join(d, 'gradle-8.11.1-all.zip.ok'), '');
    expect(t.gradleDistributionReady('gradle-8.11.1-all', home)).toBe(true); // marqueur écrit par Gradle à la fin
    expect(t.gradleDistributionReady(null, home)).toBe(false);
    expect(t.gradleDistributionReady('gradle-8.11.1-all', join(home, 'absent'))).toBe(false);
  });
});

describe('commande Gradle multiplateforme', () => {
  it('Windows : gradlew.bat via cmd.exe (« ./gradlew » n\'existe pas sous CMD)', () => {
    const inv = t.gradleInvocation('win32', 'C:\\agriflow\\android', ['assembleDebug']);
    expect(inv.command).toBe('cmd.exe');
    expect(inv.args).toEqual(['/d', '/s', '/c', 'gradlew.bat', 'assembleDebug']);
    expect(inv.cwd).toBe('C:\\agriflow\\android');
  });
  it('Linux/macOS : ./gradlew par chemin absolu, sans shell', () => {
    for (const p of ['linux', 'darwin']) {
      const inv = t.gradleInvocation(p, '/work/android', ['bundleRelease', '--info']);
      expect(inv.command).toBe(join('/work/android', 'gradlew'));
      expect(inv.args).toEqual(['bundleRelease', '--info']);
    }
  });
  it('chemin de l\'APK de débogage', () => { expect(t.APK_DEBUG_PATH).toBe('android/app/build/outputs/apk/debug/app-debug.apk'); });
});

describe('variables du build lues comme Vite (cas Windows : fichier .env.production, pas d\'export)', () => {
  const GOOD = 'VITE_SUPABASE_URL=https://abc.supabase.co\nVITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.sig12345\nVITE_PUBLIC_WEB_URL=https://agriflow.example.com\n';
  it('un .env.production (fins de ligne CRLF comprises) suffit', () => {
    const root = tmp(); writeFileSync(join(root, '.env.production'), GOOD.replace(/\n/g, '\r\n'));
    // variables absentes du shell (cas Windows) : seul le fichier fournit les valeurs
    for (const k of ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'VITE_PUBLIC_WEB_URL']) delete process.env[k];
    expect(c.checkEnv(c.loadBuildEnv(root))).toEqual([]);
  });
  it('l\'environnement du shell est prioritaire sur le fichier', () => {
    const root = tmp(); writeFileSync(join(root, '.env.production'), GOOD);
    vi.stubEnv('VITE_PUBLIC_WEB_URL', 'http://localhost:5173');
    expect(c.checkEnv(c.loadBuildEnv(root)).join(' ')).toMatch(/VITE_PUBLIC_WEB_URL/);
  });
  it('sans fichier ni variables : problèmes explicites', () => {
    for (const k of ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'VITE_PUBLIC_WEB_URL']) delete process.env[k];
    expect(c.checkEnv(c.loadBuildEnv(tmp()))).toHaveLength(3);
  });
});

describe('projet Android synchronisé avec le build web actuel', () => {
  const put = (dir: string, files: Record<string, string>) => { for (const [f, txt] of Object.entries(files)) { const p = join(dir, f); mkdirSync(join(p, '..'), { recursive: true }); writeFileSync(p, txt); } };
  it('identique (les fichiers cordova générés par cap sync sont ignorés)', () => {
    const r = tmp(); const files = { 'index.html': '<html>v2</html>', 'assets/app.js': 'x=2' };
    put(join(r, 'dist'), files); put(join(r, 'pub'), { ...files, 'cordova.js': '//', 'cordova_plugins.js': '//' });
    expect(c.compareWebAssets(join(r, 'dist'), join(r, 'pub'))).toEqual([]);
  });
  it('détecte un build plus récent que la synchronisation (fichier modifié)', () => {
    const r = tmp(); put(join(r, 'dist'), { 'index.html': 'v2', 'assets/app.js': 'x=2' }); put(join(r, 'pub'), { 'index.html': 'v1', 'assets/app.js': 'x=2' });
    const p = c.compareWebAssets(join(r, 'dist'), join(r, 'pub')).join(' ');
    expect(p).toMatch(/1 fichier\(s\) différent/); expect(p).toMatch(/cap:sync/);
  });
  it('détecte fichiers manquants et obsolètes', () => {
    const r = tmp(); put(join(r, 'dist'), { 'index.html': 'a', 'assets/new.js': 'n' }); put(join(r, 'pub'), { 'index.html': 'a', 'assets/old.js': 'o' });
    const p = c.compareWebAssets(join(r, 'dist'), join(r, 'pub')).join(' ');
    expect(p).toMatch(/absent\(s\) du projet natif \(assets\/new\.js\)/); expect(p).toMatch(/obsolète\(s\).*old\.js/);
  });
  it('dossiers absents : message clair, jamais d\'exception', () => {
    const r = tmp(); mkdirSync(join(r, 'dist'));
    expect(c.compareWebAssets(join(r, 'nope'), join(r, 'pub')).join('')).toMatch(/absent/);
    expect(c.compareWebAssets(join(r, 'dist'), join(r, 'pub')).join('')).toMatch(/cap sync/);
  });
});
