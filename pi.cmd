@echo off
REM Wrapper: sync stack prima che Pi carichi models.json (da qualsiasi cwd).
call "%~dp0scripts\pi.cmd" %*