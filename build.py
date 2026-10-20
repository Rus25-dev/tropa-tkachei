# Сборка: склеивает исходники из src/ в один index.html для GitHub Pages.
# Запуск: python build.py
import os
SRC = os.path.join(os.path.dirname(__file__), 'src')
parts = ["level.js", "art.js", "sound.js", "music.js", "settings.js", "touch.js", "net.js", "game.js", "misha.js", "vladik.js", "tima.js","bosses2.js", "combat2.js", "enemies2.js", "campaign.js", "qol.js", "access.js", "update.js"]
code = "\n".join(open(os.path.join(SRC, f), encoding='utf-8').read() for f in parts)
code = code.replace("if (typeof module !== 'undefined') module.exports = { buildLevel, T, EMPTY, SOLID, PLAT, SPIKE };", "")
import os as _os, datetime as _dt
BUILD = _os.environ.get("BUILD") or _dt.datetime.utcnow().strftime("%y%m%d.%H%M")
code = code.replace("__BUILD__", BUILD)
html = open(os.path.join(SRC, 'shell.html'), encoding='utf-8').read().replace("/*__CODE__*/", code)
page = ('<!doctype html>\n<html lang="ru">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">\n'
        '<meta name="description" content="Тропа Ткачей — кооперативная метроидвания в браузере. Вдвоём за одним компьютером или по сети.">\n'
        '<meta name="theme-color" content="#070d0c">\n<meta name="apple-mobile-web-app-capable" content="yes">\n<meta name="mobile-web-app-capable" content="yes">\n'
        '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">\n<meta name="apple-mobile-web-app-title" content="Тропа Ткачей">\n'
        '<link rel="manifest" href="manifest.webmanifest">\n<link rel="apple-touch-icon" href="icon-180.png">\n<link rel="icon" type="image/png" href="icon-192.png">\n'
        '</head>\n<body>\n' + html + '\n</body>\n</html>\n')
open(os.path.join(os.path.dirname(__file__), 'index.html'), 'w', encoding='utf-8').write(page)
print('index.html собран')

import json as _json, re as _re
_ver = _re.search(r"GAME_VERSION = '([^']+)'", code).group(1)
_json.dump({'version': _ver, 'build': BUILD}, open(os.path.join(os.path.dirname(__file__), 'version.json'), 'w', encoding='utf-8'), ensure_ascii=False)
print('version.json:', _ver, BUILD)
