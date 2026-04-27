#!/usr/bin/env python3
"""
RickArena Concept Art V3 — Rick redo
Hair correction: long but NOT shoulder-length. Action shot with SMG.
"""

import json
import urllib.request
import time

COMFYUI_URL = "http://127.0.0.1:8188"

STYLE = (
    "animated digital illustration, bold clean black outlines, cel-shaded coloring, "
    "dark moody color palette, smooth gradients and flat color fills with subtle shading, "
    "stylized proportions, comic book meets animated series aesthetic, "
    "similar to Castlevania Netflix animation style, high contrast lighting, "
    "dramatic shadows, clean detailed rendering, horror game splash art, "
    "dark atmospheric background with volumetric fog and haze, "
    "blood and gore rendered in stylized animation style with dark red splatters, "
    "NOT photorealistic, NOT 3D render, purely 2D animated illustration, "
)

SKY = (
    "deep crimson red sky with layers of dark brooding clouds rendered in animated style, "
    "thick haze and smoke particles, faint orange-red glow on the horizon, "
    "oppressive dark atmosphere, "
)

PROMPT = {
    "detailed": (
        f"{STYLE}{SKY}"
        "A tall imposing muscular man in his late 20s in the middle of an intense firefight. "
        "He has dark wavy hair that is long and flows loosely but does NOT reach his shoulders, "
        "roughly chin-length, swept back and messy from combat. Thick dark full beard. "
        "Dark aviator sunglasses on his face reflecting muzzle flash. "
        "He wears a green flannel shirt with the sleeves rolled up high above his elbows, "
        "showing off his big muscular arms covered in full sleeve tattoos on both arms. "
        "The shirt is unbuttoned over a dark tank top. Blue jeans and combat boots. "
        "He is firing a submachine gun with one hand while mid-stride, moving aggressively forward. "
        "Muzzle flash lights up his face and the smoke around him. Shell casings eject from the gun. "
        "In front of him, two zombies are getting shredded by the gunfire, "
        "dark red blood spraying from bullet impacts across their chests and heads, "
        "one zombie staggering backward with chunks of flesh torn away, "
        "the other crumpling to the ground with a blood trail. "
        "The zombies have grey rotting skin, tattered clothing, exposed wounds. "
        "The street behind him is a war zone: burning wrecked cars, crumbling buildings, "
        "rubble and debris everywhere, a distant fire glowing orange through the haze. "
        "Another zombie lurks in the shadows of a doorway to the side. "
        "Intense dynamic action shot, the man looks unstoppable and in control. "
        "Slight dutch angle, dramatic lighting from muzzle flash and the red sky, "
        "wide cinematic composition, 16:9 aspect ratio."
    ),
    "short": "Muscular bearded man with sunglasses firing SMG at zombies in ruined city, animated cel-shaded action"
}


def queue_prompt(workflow):
    data = json.dumps({"prompt": workflow}).encode("utf-8")
    req = urllib.request.Request(
        f"{COMFYUI_URL}/prompt",
        data=data,
        headers={"Content-Type": "application/json"}
    )
    resp = urllib.request.urlopen(req)
    return json.loads(resp.read()).get("prompt_id")


def get_history(prompt_id):
    try:
        resp = urllib.request.urlopen(f"{COMFYUI_URL}/history/{prompt_id}")
        history = json.loads(resp.read())
        return history.get(prompt_id)
    except Exception:
        return None


def wait_for_completion(prompt_id, timeout=600):
    print("  Waiting for completion...")
    start = time.time()
    while time.time() - start < timeout:
        history = get_history(prompt_id)
        if history and "outputs" in history:
            return history
        time.sleep(5)
    print("  TIMEOUT")
    return None


def main():
    print("=" * 60)
    print("RickArena V3 — Rick Redo (hair fix + action shot)")
    print("=" * 60)

    api_workflow = {
        "1": {
            "class_type": "UNETLoader",
            "inputs": {"unet_name": "flux1-dev.safetensors", "weight_dtype": "default"}
        },
        "2": {
            "class_type": "DualCLIPLoader",
            "inputs": {
                "clip_name1": "clip_l.safetensors",
                "clip_name2": "t5xxl_fp8_e4m3fn.safetensors",
                "type": "flux", "device": "default"
            }
        },
        "3": {
            "class_type": "VAELoader",
            "inputs": {"vae_name": "ae.safetensors"}
        },
        "4": {
            "class_type": "CLIPTextEncodeFlux",
            "inputs": {
                "clip_l": PROMPT["detailed"],
                "t5xxl": PROMPT["detailed"],
                "guidance": 3.5,
                "clip": ["2", 0]
            }
        },
        "5": {
            "class_type": "EmptySD3LatentImage",
            "inputs": {"width": 1344, "height": 768, "batch_size": 1}
        },
        "6": {
            "class_type": "KSampler",
            "inputs": {
                "seed": int(time.time() * 1000) % (2**32),
                "control_after_generate": "randomize",
                "steps": 28, "cfg": 3.5,
                "sampler_name": "euler", "scheduler": "simple", "denoise": 1.0,
                "model": ["1", 0], "positive": ["4", 0],
                "negative": ["4", 0], "latent_image": ["5", 0]
            }
        },
        "7": {
            "class_type": "VAEDecode",
            "inputs": {"samples": ["6", 0], "vae": ["3", 0]}
        },
        "8": {
            "class_type": "SaveImage",
            "inputs": {"filename_prefix": "rickarena_v3_rick-action-redo", "images": ["7", 0]}
        },
        "10": {
            "class_type": "UpscaleModelLoader",
            "inputs": {"model_name": "RealESRGAN_x4.pth"}
        },
        "11": {
            "class_type": "ImageUpscaleWithModel",
            "inputs": {"upscale_model": ["10", 0], "image": ["7", 0]}
        },
        "12": {
            "class_type": "SaveImage",
            "inputs": {"filename_prefix": "rickarena_v3_rick-action-redo_upscaled", "images": ["11", 0]}
        }
    }

    print("[QUEUE] rick-action-redo")
    prompt_id = queue_prompt(api_workflow)
    print(f"  -> Queued: {prompt_id}")

    result = wait_for_completion(prompt_id)
    if result:
        print("[DONE] rick-action-redo")
        for node_id, node_out in result.get("outputs", {}).items():
            if "images" in node_out:
                for img in node_out["images"]:
                    print(f"  -> {img.get('filename', 'unknown')}")
    else:
        print("[FAIL]")


if __name__ == "__main__":
    main()
