@echo off
chcp 65001 >nul
title Coup de Pouce by EITT
cd /d "%~dp0"

echo.
echo  === Coup de Pouce by EITT ===
echo.

where node >nul 2>nul
if errorlevel 1 goto nonode
node -e "process.exit(Number(process.versions.node.split('.')[0])>=22?0:1)" >nul 2>nul
if errorlevel 1 goto oldnode

if exist node_modules goto deps_ok
echo Premiere utilisation : installation des composants (1 a 3 minutes, connexion Internet necessaire)...
call npm install
if errorlevel 1 goto npmfail
:deps_ok

if exist .env.local goto env_ok
copy .env.example .env.local >nul
echo.
echo Un fichier .env.local vient d'etre cree. Pour activer les comptes et la messagerie :
echo   1. creez un projet gratuit sur https://supabase.com
echo   2. collez le contenu de supabase\setup_all.sql dans Supabase ^> SQL Editor ^> Run
echo   3. copiez l'URL et la cle "anon" du projet dans .env.local (le Bloc-notes va s'ouvrir)
echo En attendant, le site s'ouvre quand meme (page "Configuration requise" pour les comptes).
echo.
start "" notepad .env.local
:env_ok

echo Demarrage du site... il s'ouvre dans votre navigateur. Fermez cette fenetre pour l'arreter.
call npm run dev -- --open
goto end

:nonode
echo Node.js n'est pas installe sur cet ordinateur.
echo Telechargez la version "LTS" sur https://nodejs.org, installez-la, puis relancez ce fichier.
start "" https://nodejs.org
goto end

:oldnode
echo Votre version de Node.js est trop ancienne (il faut la version 22 ou plus recente).
echo Telechargez la version "LTS" sur https://nodejs.org, installez-la, puis relancez ce fichier.
start "" https://nodejs.org
goto end

:npmfail
echo L'installation a echoue. Verifiez votre connexion Internet puis relancez ce fichier.

:end
echo.
pause
