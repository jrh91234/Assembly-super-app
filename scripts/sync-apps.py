#!/usr/bin/env python3
"""Copy each app's front-end from its source repo into apps/<id>/.

Usage:
  python3 scripts/sync-apps.py                 # clone every repo from GitHub
  python3 scripts/sync-apps.py --local ../     # use sibling checkouts instead
  python3 scripts/sync-apps.py coil-winding    # sync only the given app ids

Apps Script back-ends (scr/, src/*.gs) are never copied: each app keeps
calling its own deployed Web App URL, so the super app needs no backend.
"""
import argparse, json, os, shutil, subprocess, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APPS_DIR = os.path.join(ROOT, "apps")
SKIP = {".git", ".github", ".claude", "node_modules", "README.md", ".nojekyll"}


def fetch_repo(app, tmp, local_root):
    name = app["repo"].split("/", 1)[1]
    if local_root:
        path = os.path.join(local_root, name)
        if not os.path.isdir(path):
            sys.exit(f"[{app['id']}] local checkout not found: {path}")
        subprocess.run(["git", "-C", path, "fetch", "--quiet", "origin", app["branch"]], check=False)
        dest = os.path.join(tmp, name)
        subprocess.run(["git", "-C", path, "worktree", "prune"], check=False)
        subprocess.run(["git", "clone", "--quiet", "--depth", "1", "--branch", app["branch"],
                        "file://" + os.path.abspath(path), dest], check=True)
        # file:// clone sees local refs; prefer the freshly fetched remote ref.
        subprocess.run(["git", "-C", dest, "fetch", "--quiet", "--depth", "1",
                        "file://" + os.path.abspath(path), f"refs/remotes/origin/{app['branch']}"], check=False)
        subprocess.run(["git", "-C", dest, "checkout", "--quiet", "FETCH_HEAD"], check=False)
        return dest
    token = os.environ.get("SYNC_TOKEN")  # only needed if a source repo turns private
    host = f"x-access-token:{token}@github.com" if token else "github.com"
    dest = os.path.join(tmp, name)
    subprocess.run(["git", "clone", "--quiet", "--depth", "1", "--branch", app["branch"],
                    f"https://{host}/{app['repo']}.git", dest], check=True)
    return dest


def copy_item(src, dst):
    if os.path.isdir(src):
        shutil.copytree(src, dst, ignore=lambda d, names: [n for n in names if n in SKIP])
    else:
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copy2(src, dst)


def sync(app, tmp, local_root):
    repo = fetch_repo(app, tmp, local_root)
    commit = subprocess.run(["git", "-C", repo, "rev-parse", "HEAD"],
                            capture_output=True, text=True, check=True).stdout.strip()
    base = os.path.join(repo, app.get("source", "."))
    out = os.path.join(APPS_DIR, app["id"])
    shutil.rmtree(out, ignore_errors=True)
    os.makedirs(out)
    for item in app["include"]:
        src = os.path.normpath(os.path.join(base, item))
        if item == ".":
            for n in os.listdir(base):
                if n not in SKIP:
                    copy_item(os.path.join(base, n), os.path.join(out, n))
        elif os.path.exists(src):
            copy_item(src, os.path.join(out, item))
        else:
            print(f"[{app['id']}] warning: {item} not found in {app['repo']}")
    with open(os.path.join(out, ".source.json"), "w") as f:
        json.dump({"repo": app["repo"], "branch": app["branch"], "commit": commit}, f, indent=2)
        f.write("\n")
    print(f"[{app['id']}] {app['repo']}@{app['branch']} {commit[:7]}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("ids", nargs="*", help="app ids to sync (default: all)")
    ap.add_argument("--local", help="directory holding local checkouts of the source repos")
    args = ap.parse_args()
    with open(os.path.join(ROOT, "apps.config.json")) as f:
        apps = json.load(f)["apps"]
    unknown = set(args.ids) - {a["id"] for a in apps}
    if unknown:
        sys.exit(f"unknown app id(s): {', '.join(sorted(unknown))}")
    with tempfile.TemporaryDirectory() as tmp:
        for app in apps:
            if not args.ids or app["id"] in args.ids:
                sync(app, tmp, args.local)


if __name__ == "__main__":
    main()
