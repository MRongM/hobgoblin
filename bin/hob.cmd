@echo off
setlocal DisableDelayedExpansion

if not "%~2"=="" goto too_many_arguments

set "target=%~1"
if not defined target set "target=."

if "%target%"=="-h" goto help
if "%target%"=="--help" goto help
if "%target:~0,1%"=="-" goto unknown_option

for %%I in ("%target%") do set "target=%%~fI"
if not exist "%target%" goto missing_directory
for %%I in ("%target%") do set "target_attributes=%%~aI"
if not "%target_attributes:~0,1%"=="d" goto not_directory

if defined HOBGOBLIN_CLI_EXECUTABLE goto launch_override

for %%I in ("%~dp0..\..\Hobgoblin.exe") do set "executable=%%~fI"
if not exist "%executable%" goto missing_application

start "" "%executable%" "--hob-open" "%target%"
if errorlevel 1 goto dispatch_failed
exit /b 0

:launch_override
set "executable=%HOBGOBLIN_CLI_EXECUTABLE%"
if not exist "%executable%" goto missing_application
call "%executable%" "--hob-open" "%target%"
if errorlevel 1 goto dispatch_failed
exit /b 0

:help
call :usage
exit /b 0

:too_many_arguments
echo hob: Expected at most one directory. 1>&2
exit /b 2

:unknown_option
echo hob: Unknown option: "%target%". 1>&2
call :usage 1>&2
exit /b 2

:missing_directory
echo hob: Directory does not exist: "%target%". 1>&2
exit /b 2

:not_directory
echo hob: Not a directory: "%target%". 1>&2
exit /b 2

:missing_application
echo hob: Hobgoblin application executable was not found at "%executable%". Reinstall Hobgoblin. 1>&2
exit /b 1

:dispatch_failed
echo hob: Failed to start Hobgoblin from "%executable%". 1>&2
exit /b 1

:usage
echo Usage: hob [directory]
echo Open a local directory as a project in Hobgoblin for Windows.
exit /b 0
