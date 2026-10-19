# Сборка: склеивает исходники из src/ в один index.html для GitHub Pages.
# Запуск: python build.py
import os
SRC = os.path.join(os.path.dirname(__file__), 'src')
parts = ["level.js", "art.js", "sound.js", "net.js", "game.js"]
code = "\n".join(open(os.path.join(SRC, f), encoding='utf-8').read() for f in parts)
code = code.replace("if (typeof module !== 'undefined') module.exports = { buildLevel, T, EMPTY, SOLID, PLAT, SPIKE };", "")
html = open(os.path.join(SRC, 'shell.html'), encoding='utf-8').read().replace("/*__CODE__*/", code)
page = ('<!doctype html>\n<html lang="ru">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
        '<meta name="description" content="Тропа Ткачей — кооперативная метроидвания в браузере. Вдвоём за одним компьютером или по сети.">\n'
        '</head>\n<body>\n' + html + '\n</body>\n</html>\n')
open(os.path.join(os.path.dirname(__file__), 'index.html'), 'w', encoding='utf-8').write(page)
print('index.html собран')
