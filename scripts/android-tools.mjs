#!/usr/bin/env node
/**
 * Outils Android multiplateformes (Windows CMD/PowerShell, macOS, Linux) — aucun effet sur le build web.
 *   node scripts/android-tools.mjs doctor                      diagnostic complet (JDK 21, SDK, wrapper Gradle, synchronisation, variables)
 *   node scripts/android-tools.mjs gradle [--dry-run] <tâche>  lance le wrapper Gradle APRÈS vérification du JDK 21 et du SDK
 *
 * Pourquoi : npm exécute les scripts avec cmd.exe sous Windows, où `./gradlew` n'existe pas (c'est `gradlew.bat`), et Gradle
 * échoue de façon peu lisible sans JDK 21 ni SDK. Ce script choisit la bonne commande, vérifie les prérequis et explique chaque échec.
 * Il ne crée jamais d'APK lui-même et n'annonce un APK que si le fichier existe réellement.
 */
import { spawnSync } from 'node:child_process';
import { accessSync, constants, existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { checkEnv, checkNativeConfig, compareWebAssets, loadBuildEnv } from './mobile-checks.mjs';

export const REQUIRED_JAVA_MAJOR = 21; // sourceCompatibility JavaVersion.VERSION_21 dans le projet généré par Capacitor 7
export const COMPILE_SDK = 35;
export const APK_DEBUG_PATH = 'android/app/build/outputs/apk/debug/app-debug.apk';

/** `openjdk version "21.0.4"` → 21 ; `"1.8.0_392"` → 8 ; sinon null. */
export function parseJavaMajor(output) {
  const m = /version "(\d+)(?:\.(\d+))?/.exec(String(output));
  if (!m) return null;
  const major = Number(m[1]);
  return major === 1 && m[2] ? Number(m[2]) : major;
}

/** Format .properties : `sdk.dir=C\:\\Users\\moi\\AppData\\Local\\Android\\Sdk` → `C:\Users\moi\AppData\Local\Android\Sdk`. */
export function parseLocalProperties(text) {
  const out = {};
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith('!')) continue;
    const i = line.search(/[=:]/);
    if (i < 0) continue;
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/\\(.)/g, '$1');
  }
  return out;
}

export function defaultSdkDirs(platform, env, home) {
  if (platform === 'win32') return [env.LOCALAPPDATA ? join(env.LOCALAPPDATA, 'Android', 'Sdk') : join(home, 'AppData', 'Local', 'Android', 'Sdk')];
  if (platform === 'darwin') return [join(home, 'Library', 'Android', 'sdk')];
  return [join(home, 'Android', 'Sdk'), join(home, 'Android', 'sdk')];
}

/** Ordre : ANDROID_HOME, ANDROID_SDK_ROOT, android/local.properties, emplacement par défaut d'Android Studio. */
export function resolveSdkDir({ platform, env, home, localProperties, exists }) {
  for (const name of ['ANDROID_HOME', 'ANDROID_SDK_ROOT']) if (env[name] && exists(env[name])) return { dir: env[name], source: name };
  const lp = localProperties?.['sdk.dir'];
  if (lp && exists(lp)) return { dir: lp, source: 'android/local.properties' };
  for (const d of defaultSdkDirs(platform, env, home)) if (exists(d)) return { dir: d, source: 'emplacement par défaut d\'Android Studio' };
  return { dir: null, source: null };
}

/** JDK 21 fourni avec Android Studio (JBR), utile quand aucun JDK 21 n'est installé séparément. */
export function candidateJdkHomes(platform, env, home) {
  if (platform === 'win32') {
    const pf = [env.ProgramFiles ?? 'C:\\Program Files', env.LOCALAPPDATA ? join(env.LOCALAPPDATA, 'Programs') : null].filter(Boolean);
    return pf.map((p) => join(p, 'Android', 'Android Studio', 'jbr'));
  }
  if (platform === 'darwin') return ['/Applications/Android Studio.app/Contents/jbr/Contents/Home'];
  return [join(home, 'android-studio', 'jbr'), '/opt/android-studio/jbr', '/usr/local/android-studio/jbr'];
}

/** Commande du wrapper Gradle : `gradlew.bat` via cmd.exe sous Windows, `./gradlew` ailleurs. Jamais de shell implicite. */
export function gradleInvocation(platform, androidDir, gradleArgs) {
  if (platform === 'win32') return { command: 'cmd.exe', args: ['/d', '/s', '/c', 'gradlew.bat', ...gradleArgs], cwd: androidDir };
  return { command: join(androidDir, 'gradlew'), args: gradleArgs, cwd: androidDir };
}

export function checkSdkPackages(sdkDir, exists = existsSync) {
  const problems = [];
  if (!exists(join(sdkDir, 'platforms', `android-${COMPILE_SDK}`))) problems.push(`SDK Platform ${COMPILE_SDK} absente (Android Studio → SDK Manager → « Android ${COMPILE_SDK} »).`);
  if (!exists(join(sdkDir, 'platform-tools'))) problems.push('Platform-Tools absents (SDK Manager → SDK Tools → « Android SDK Platform-Tools »).');
  const bt = join(sdkDir, 'build-tools');
  if (!exists(bt) || (typeof readdirSync === 'function' && exists(bt) && readdirSync(bt).length === 0)) problems.push('Build-Tools absents (SDK Manager → SDK Tools → « Android SDK Build-Tools »).');
  return problems;
}

/** `distributionUrl=…/gradle-8.11.1-all.zip` → `gradle-8.11.1-all` (nom du dossier de distribution), sinon null. */
export function wrapperDistributionName(propertiesText) {
  const m = /distributionUrl=.*?(gradle-\d+(?:\.\d+){1,2}-(?:all|bin))\.zip/.exec(String(propertiesText).replace(/\\:/g, ':'));
  return m ? m[1] : null;
}

/**
 * La distribution Gradle est-elle RÉELLEMENT téléchargée ? Gradle écrit `<nom>.zip.ok` uniquement quand le téléchargement est
 * complet ; un dossier vide ou des fichiers `.part`/`.lck` (téléchargement échoué ou en cours) ne comptent pas.
 */
export function gradleDistributionReady(distName, gradleUserHome, exists = existsSync, list = readdirSync) {
  if (!distName) return false;
  const base = join(gradleUserHome, 'wrapper', 'dists', distName);
  if (!exists(base)) return false;
  return list(base).some((hash) => exists(join(base, hash, `${distName}.zip.ok`)));
}

function javaVersionOf(javaHome) {
  const exe = javaHome ? join(javaHome, 'bin', process.platform === 'win32' ? 'java.exe' : 'java') : 'java';
  if (javaHome && !existsSync(exe)) return null;
  const r = spawnSync(exe, ['-version'], { encoding: 'utf8' });
  if (r.error || r.status !== 0) return null;
  return parseJavaMajor(`${r.stdout}\n${r.stderr}`);
}

/** Trouve un JDK 21 : JAVA_HOME, puis `java` du PATH, puis JBR d'Android Studio. */
export function findJdk21(env = process.env, platform = process.platform, home = homedir()) {
  const tried = [];
  if (env.JAVA_HOME) { const v = javaVersionOf(env.JAVA_HOME); tried.push(`JAVA_HOME=${env.JAVA_HOME} → ${v ?? 'introuvable'}`); if (v === REQUIRED_JAVA_MAJOR) return { javaHome: env.JAVA_HOME, source: 'JAVA_HOME', tried }; }
  const onPath = javaVersionOf(null); tried.push(`java (PATH) → ${onPath ?? 'introuvable'}`);
  if (onPath === REQUIRED_JAVA_MAJOR && !env.JAVA_HOME) return { javaHome: null, source: 'PATH', tried };
  for (const c of candidateJdkHomes(platform, env, home)) {
    const v = javaVersionOf(c);
    if (v !== null) tried.push(`${c} → ${v}`);
    if (v === REQUIRED_JAVA_MAJOR) return { javaHome: c, source: 'JBR d\'Android Studio', tried };
  }
  if (onPath === REQUIRED_JAVA_MAJOR) return { javaHome: null, source: 'PATH', tried };
  return { javaHome: null, source: null, tried };
}

const JDK_HELP = `Installez un JDK ${REQUIRED_JAVA_MAJOR} (Temurin : https://adoptium.net) ou utilisez celui d'Android Studio, puis définissez JAVA_HOME (ex. Windows : setx JAVA_HOME "C:\\Program Files\\Android\\Android Studio\\jbr").`;
const SDK_HELP = 'Installez Android Studio (il installe le SDK), ouvrez-le une fois, puis définissez ANDROID_HOME (ex. Windows : setx ANDROID_HOME "%LOCALAPPDATA%\\Android\\Sdk") ou créez android/local.properties avec sdk.dir=…';

function readLocalProperties(root) {
  const p = join(root, 'android', 'local.properties');
  return existsSync(p) ? parseLocalProperties(readFileSync(p, 'utf8')) : {};
}

function wrapperProblems(root, platform) {
  const problems = [];
  const a = join(root, 'android');
  for (const f of ['gradlew', 'gradlew.bat', 'gradle/wrapper/gradle-wrapper.jar', 'gradle/wrapper/gradle-wrapper.properties']) {
    if (!existsSync(join(a, f))) problems.push(`android/${f} introuvable : régénérez le projet (npx cap add android).`);
  }
  const gw = join(a, 'gradlew');
  if (existsSync(gw)) {
    if (platform !== 'win32') { try { accessSync(gw, constants.X_OK); } catch { problems.push('android/gradlew n\'est pas exécutable : chmod +x android/gradlew'); } }
    if (readFileSync(gw, 'utf8').includes('\r')) problems.push('android/gradlew contient des fins de ligne Windows (CRLF) : inutilisable sous Linux/macOS/Git Bash (voir .gitattributes).');
  }
  const bat = join(a, 'gradlew.bat');
  if (existsSync(bat) && !readFileSync(bat, 'utf8').includes('\r\n')) problems.push('android/gradlew.bat n\'a pas de fins de ligne CRLF : peut échouer sous Windows (voir .gitattributes).');
  return problems;
}

function doctor(root = '.') {
  const platform = process.platform;
  const blocking = [], warnings = [];
  const line = (ok, label, detail = '') => console.log(`${ok === true ? '✔' : ok === 'warn' ? '⚠' : '✖'} ${label}${detail ? ` — ${detail}` : ''}`);

  console.log(`AgriFlow RDC — diagnostic Android (${platform}, Node ${process.versions.node})\n`);
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  if (nodeMajor >= 20) line(true, 'Node.js', `≥ 20 requis (CLI Capacitor 7) : ${process.versions.node}`); else { line(false, 'Node.js', `${process.versions.node} < 20`); blocking.push('Node.js ≥ 20 requis.'); }

  const jdk = findJdk21();
  if (jdk.source) line(true, `JDK ${REQUIRED_JAVA_MAJOR}`, jdk.source + (jdk.javaHome ? ` (${jdk.javaHome})` : '')); else { line(false, `JDK ${REQUIRED_JAVA_MAJOR}`, jdk.tried.join(' ; ')); blocking.push(JDK_HELP); }

  const sdk = resolveSdkDir({ platform, env: process.env, home: homedir(), localProperties: readLocalProperties(root), exists: existsSync });
  if (sdk.dir) {
    line(true, 'SDK Android', `${sdk.dir} (${sdk.source})`);
    const pk = checkSdkPackages(sdk.dir);
    if (pk.length) { line('warn', 'Paquets du SDK', pk.join(' ')); warnings.push(...pk); } else line(true, `Paquets du SDK (Platform ${COMPILE_SDK}, Platform-Tools, Build-Tools)`);
  } else { line(false, 'SDK Android', 'introuvable'); blocking.push(SDK_HELP); }

  const wp = wrapperProblems(root, platform);
  if (wp.length) { line(false, 'Wrapper Gradle', wp.join(' ')); blocking.push(...wp); } else line(true, 'Wrapper Gradle', platform === 'win32' ? 'gradlew.bat présent (CRLF)' : 'gradlew présent et exécutable (LF)');
  const propsFile = join(root, 'android', 'gradle', 'wrapper', 'gradle-wrapper.properties');
  const distName = existsSync(propsFile) ? wrapperDistributionName(readFileSync(propsFile, 'utf8')) : null;
  const ready = gradleDistributionReady(distName, process.env.GRADLE_USER_HOME ?? join(homedir(), '.gradle'));
  line(ready ? true : 'warn', `Distribution Gradle (${distName ?? 'inconnue'})`, ready ? 'téléchargée' : 'pas encore téléchargée : elle le sera au premier build (environ 200 Mo ; accès à services.gradle.org requis)');
  if (platform === 'win32' && resolve(root).length > 90) line('warn', 'Longueur du chemin du projet', `${resolve(root).length} caractères : au-delà d'environ 200 caractères Windows échoue (MAX_PATH). Préférez un dossier court (ex. C:\\agriflow).`);

  const nativeProblems = checkNativeConfig(root);
  const distDir = join(root, 'dist'), androidPublic = join(root, 'android', 'app', 'src', 'main', 'assets', 'public');
  const stale = existsSync(distDir) ? compareWebAssets(distDir, androidPublic) : ['dist/ absent : le build web n\'a pas été fait.'];
  const syncProblems = [...nativeProblems, ...stale];
  if (syncProblems.length) { line(false, 'Projet Android synchronisé avec le build web actuel', syncProblems.join(' ')); blocking.push('Lancez `npm run cap:sync` (build web + synchronisation).'); } else line(true, 'Projet Android synchronisé avec le build web actuel', 'fichiers identiques, aucune URL de développement');

  const envProblems = checkEnv(loadBuildEnv(root));
  if (envProblems.length) { line(false, 'Variables du build mobile (.env.production ou environnement)', envProblems.join(' ')); blocking.push('Renseignez les variables VITE_* (voir docs/CAPACITOR-MOBILE.md §4).'); } else line(true, 'Variables du build mobile');

  console.log('');
  if (blocking.length) { console.log(`✖ ${blocking.length} point(s) bloquant(s) :`); [...new Set(blocking)].forEach((b) => console.log(`  - ${b}`)); }
  if (warnings.length) { console.log(`⚠ ${warnings.length} avertissement(s) :`); warnings.forEach((w) => console.log(`  - ${w}`)); }
  if (!blocking.length) console.log('✔ Prérequis réunis : `npm run android:debug` peut être lancé (aucune compilation n\'a été faite par ce diagnostic).');
  return blocking.length === 0 ? 0 : 1;
}

function runGradle(args, root = '.') {
  const dry = args.includes('--dry-run');
  const gradleArgs = args.filter((a) => a !== '--dry-run');
  if (gradleArgs.length === 0) { console.error('Usage : node scripts/android-tools.mjs gradle [--dry-run] <tâche> (ex. assembleDebug)'); return 2; }
  const platform = process.platform;
  const env = { ...process.env };

  const jdk = findJdk21();
  if (!jdk.source) { console.error(`✖ JDK ${REQUIRED_JAVA_MAJOR} introuvable (${jdk.tried.join(' ; ')}).\n  ${JDK_HELP}`); return 1; }
  if (jdk.javaHome) { env.JAVA_HOME = jdk.javaHome; if (jdk.source !== 'JAVA_HOME') console.log(`ℹ JDK ${REQUIRED_JAVA_MAJOR} utilisé pour cette commande : ${jdk.javaHome} (${jdk.source}).`); }

  const sdk = resolveSdkDir({ platform, env, home: homedir(), localProperties: readLocalProperties(root), exists: existsSync });
  if (!sdk.dir) { console.error(`✖ SDK Android introuvable.\n  ${SDK_HELP}`); return 1; }
  if (!env.ANDROID_HOME && !env.ANDROID_SDK_ROOT && sdk.source !== 'android/local.properties') { env.ANDROID_HOME = sdk.dir; console.log(`ℹ ANDROID_HOME=${sdk.dir} utilisé pour cette commande (${sdk.source}).`); }
  for (const w of checkSdkPackages(sdk.dir)) console.warn(`⚠ ${w}`);

  const wp = wrapperProblems(root, platform);
  if (wp.length) { wp.forEach((p) => console.error(`✖ ${p}`)); return 1; }

  const inv = gradleInvocation(platform, resolve(root, 'android'), gradleArgs);
  if (dry) { console.log(`[dry-run] cwd=${inv.cwd}\n[dry-run] ${inv.command} ${inv.args.join(' ')}\n[dry-run] JAVA_HOME=${env.JAVA_HOME ?? '(inchangé)'} ANDROID_HOME=${env.ANDROID_HOME ?? '(inchangé)'}`); return 0; }

  console.log(`▶ ${platform === 'win32' ? 'gradlew.bat' : './gradlew'} ${gradleArgs.join(' ')}  (le premier build télécharge Gradle puis les dépendances : plusieurs minutes)`);
  const r = spawnSync(inv.command, inv.args, { cwd: inv.cwd, env, stdio: 'inherit' });
  if (r.error) { console.error(`✖ Impossible de lancer Gradle : ${r.error.message}`); return 1; }
  if (r.status !== 0) { console.error(`✖ Gradle a échoué (code ${r.status}). Aucun APK n'est annoncé.`); return r.status ?? 1; }
  if (gradleArgs.includes('assembleDebug')) {
    const apk = join(root, APK_DEBUG_PATH);
    if (existsSync(apk)) console.log(`✔ APK de débogage présent : ${apk} (${(statSync(apk).size / 1048576).toFixed(1)} Mo)`);
    else { console.error(`✖ Gradle a terminé sans erreur mais ${apk} est introuvable.`); return 1; }
  }
  return 0;
}

function main() {
  const [mode, ...rest] = process.argv.slice(2);
  const code = mode === 'doctor' ? doctor() : mode === 'gradle' ? runGradle(rest) : (console.error('Usage : node scripts/android-tools.mjs doctor | gradle [--dry-run] <tâche>'), 2);
  process.exit(code);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
