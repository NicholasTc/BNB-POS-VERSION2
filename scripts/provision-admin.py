"""Interactive administrator setup. Secrets travel only through hidden stdin."""
import getpass
import json
import subprocess

email = input("Administrator email: ").strip()
password = getpass.getpass("Password (12–128 characters): ")
if password != getpass.getpass("Repeat password: "):
    raise SystemExit("Passwords do not match.")
reset = input("Reset existing administrator and revoke its sessions? [y/N]: ").lower() == "y"
subprocess.run(["npm", "run", "admin:bootstrap"], input=json.dumps({"email": email, "password": password, "reset": reset}), text=True, check=True)
