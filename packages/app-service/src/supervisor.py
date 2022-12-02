import json
import os
import subprocess

import requests

def get_manifests():
    # fetch our manifests from the api
    return requests.get(f"{os.environ['APP_API_ROOT']}/manifests").json()

def get_running_stacks():
    # list docker compose stacks
    try:
        compose_ls = subprocess.run(["docker", "compose", "ls", "--format", "json"], capture_output=True, check=True)
    except subprocess.CalledProcessError as e:
        print(f"Failed to list docker compose stacks: {e.stderr}")
        raise e
    # parse json
    stack_list = json.loads(compose_ls.stdout)
    # filter for running stacks
    running_stacks = [stack for stack in stack_list if "running" in stack["Status"]]
    # return our running stacks
    return running_stacks

def main():
    # get our manifests
    manifests = get_manifests()
    # get our running stacks
    running_stack_names = [stack["Name"] for stack in get_running_stacks()]
    # loop through our manifests
    print(f"Checking {len(manifests)} manifests...")
    for manifest in manifests:
        # check if our manifest is still running
        if manifest["name"] in running_stack_names:
            # nothing more to do
            continue
        # else, our stack has stopped, time to start it again
        print(f"Starting {manifest['name']}...")
        # create temp directory
        try:
            subprocess.run(["mkdir", "-p", f"/tmp/app-manifests"])
        except subprocess.CalledProcessError as e:
            print(f"Failed to create temp directory: {e.stderr}")
            raise e
        # create temp file
        manifest_filename = f"/tmp/app-manifests/{manifest['name']}.yml"
        with open(manifest_filename, "w") as file:
            # write our manifest to the file
            file.write(manifest["manifest"])
        # start our stack
        try:
            subprocess.run([
                "docker", "compose",
                "-f", manifest_filename,
                "-p", manifest['name'],
                "up",
                "-d"
            ], check=True)
        except subprocess.CalledProcessError as e:
            print(f"Failed to start stack: {e.stderr}")
            raise e
        

if __name__ == "__main__":
    main()
