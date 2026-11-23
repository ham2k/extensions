# Synthetic LoTW signing fixtures

The two password-protected backups contain the public synthetic key for
`certificate.pem`. The certificate has no ARRL authority. Use these backups
only in offline tests with a simulated host. Their public password is
`ferry-fixture`.

The backups are byte-for-byte copies of `fixtures/signing/current.p12` and
`fixtures/signing/legacy.p12` from the project this signing code is adapted
from (see `assets/LoTW-SIGNING-NOTICE.txt`). The current backup uses PBES2/AES
and a SHA-256 MAC. The legacy backup uses RC2/3DES and a SHA-1 MAC. The
signature in `vector.json` was generated independently with OpenSSL.
