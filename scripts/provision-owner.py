"""Interactive local administration. Password never appears in shell history."""
import getpass
import json
import subprocess

email = input("Owner email: ").strip()
password = getpass.getpass("Password (12–128 characters): ")
if password != getpass.getpass("Repeat password: "):
    raise SystemExit("Passwords do not match.")
reset = input("Reset an existing owner and revoke all owner sessions? [y/N]: ").lower() == "y"
subprocess.run(["npm", "run", "owner:bootstrap"], input=json.dumps({"email": email, "password": password, "reset": reset}), text=True, check=True)
