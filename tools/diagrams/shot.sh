#!/bin/bash
# usage: shot.sh file.html out.png
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --hide-scrollbars --window-size=1200,1100 --virtual-time-budget=4000 --screenshot="$2" "file://$1" >/dev/null 2>&1
