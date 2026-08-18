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

    if len(pw) < 6:
        print('비밀번호는 6자 이상으로 정하세요.', file=sys.stderr)
        return 1

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
