#!/usr/bin/env python3
"""대시보드 비밀번호를 설정한다.

  python3 set-password.py '새비밀번호'
  python3 set-password.py            # 화면에 안 보이게 입력받음

비밀번호 원문은 어디에도 저장하지 않는다. 무작위 솔트와
PBKDF2-HMAC-SHA256(210,000회) 해시만 assets/lock.js 에 기록하고,
발행용 dashboard.html 을 다시 만든다.
"""
import base64, getpass, hashlib, os, pathlib, re, subprocess, sys

ITER = 210_000
HERE = pathlib.Path(__file__).parent
LOCK = HERE / 'assets/lock.js'

def main() -> int:
    if len(sys.argv) > 2:
        print('사용법: python3 set-password.py [새비밀번호]', file=sys.stderr)
        return 2

    if len(sys.argv) == 2:
        pw = sys.argv[1]
    else:
        pw = getpass.getpass('새 비밀번호: ')
        if pw != getpass.getpass('한 번 더 입력: '):
            print('두 입력이 다릅니다.', file=sys.stderr)
            return 1

    if len(pw) < 4:
        print('비밀번호는 4자 이상으로 정하세요.', file=sys.stderr)
        return 1

    # 짧거나 숫자로만 된 비밀번호는 경고만 하고 그대로 적용한다.
    # 해시는 페이지 안에 들어가므로, 공격자가 파일을 받아 오프라인에서
    # 후보를 전부 대입해볼 수 있다. 화면의 5회 제한은 그 경우 소용이 없다.
    weak = []
    if len(pw) < 8:
        weak.append('8자 미만')
    if pw.isdigit():
        weak.append('숫자만 사용')
    if weak:
        space = 10 ** len(pw) if pw.isdigit() else None
        print('⚠ 약한 비밀번호입니다 (' + ', '.join(weak) + ').', file=sys.stderr)
        if space:
            print(f'  경우의 수가 {space:,}가지라, 페이지 파일을 가진 사람은 오프라인에서'
                  ' 전부 대입해 금방 뚫을 수 있습니다.', file=sys.stderr)
        print('  링크의 우연한 열람을 막는 용도로만 쓰고, 실제 접근 제어는'
              ' 아티팩트 공유 범위로 하세요.', file=sys.stderr)

    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac('sha256', pw.encode('utf-8'), salt, ITER, dklen=32)

    src = LOCK.read_text(encoding='utf-8')
    src, n1 = re.subn(r"(salt: ')[^']*(')", r"\g<1>" + base64.b64encode(salt).decode() + r"\g<2>", src, count=1)
    src, n2 = re.subn(r"(hash: ')[^']*(')", r"\g<1>" + base64.b64encode(digest).decode() + r"\g<2>", src, count=1)
    src, n3 = re.subn(r"(iter: )\d+", r"\g<1>" + str(ITER), src, count=1)
    if not (n1 and n2 and n3):
        print('assets/lock.js 에서 GATE 설정을 찾지 못했습니다.', file=sys.stderr)
        return 1
    LOCK.write_text(src, encoding='utf-8')

    subprocess.run([sys.executable, str(HERE / 'build-dashboard.py')], check=True)
    print('비밀번호를 설정했습니다. 발행된 링크에 반영하려면 dashboard.html 을 다시 발행하세요.')
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
