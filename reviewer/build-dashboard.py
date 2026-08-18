#!/usr/bin/env python3
"""index.html + assets/* 를 한 파일(dashboard.html)로 합친다.

dashboard.html 은 claude.ai 아티팩트로 발행하기 위한 산출물이다.
아티팩트는 외부 파일 요청을 막고 <!doctype>/<html>/<head>/<body> 를 발행 시점에
직접 씌우므로, 이 파일에는 그 태그를 넣지 않고 CSS·JS 를 모두 인라인한다.
로컬에서 직접 열어 쓸 때는 reviewer/index.html 을 사용한다.

사용법:  python3 build-dashboard.py
"""
import pathlib, re, sys

HERE = pathlib.Path(__file__).parent
html = (HERE / 'index.html').read_text(encoding='utf-8')
css = (HERE / 'assets/app.css').read_text(encoding='utf-8')
scripts = [(HERE / f'assets/{n}').read_text(encoding='utf-8')
           for n in ('lock.js', 'xlsx-lite.js', 'store.js', 'app.js')]

# <body> 안쪽만 사용
body = re.search(r'<body>(.*)</body>', html, re.S)
if not body:
    sys.exit('index.html 에서 <body> 를 찾지 못했습니다.')
markup = body.group(1)
markup = re.sub(r'\s*<script src="assets/[^"]+"></script>', '', markup).strip()

title = re.search(r'<title>(.*?)</title>', html, re.S).group(1).strip()

# 인라인 스크립트 안에서 </script> 가 파서를 끊지 않도록 방어
joined = '\n'.join(scripts).replace('</script>', '<\\/script>')

out = f"""<title>{title}</title>
<style>
{css}
</style>

{markup}

<script>
{joined}
</script>
"""
target = HERE / 'dashboard.html'
target.write_text(out, encoding='utf-8')
print(f'{target.name} 생성 완료 — {len(out)/1024:.1f}KB')
