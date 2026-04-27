#!/usr/bin/env python3
"""
RickArena Concept Art V3 — Rick redo #2
Hair correction: medium length regular men's haircut, dark/black, NOT long.
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
        "Intense action shot of a tall imposing muscular man in his late 20s in fierce combat. "
        "He has a regular medium-length men's haircut, black wavy hair, not long, not short, "
        "just a normal everyday men's hairstyle with some volume on top, slightly messy from combat. "
        "NOT long hair, NOT chin-length, NOT shoulder-length, just a standard medium men's cut. "
        "Thick dark full beard. Dark aviator sunglasses reflecting fire and muzzle flash. "
        "He wears a green flannel shirt with the sleeves rolled up high above his elbows, "
        "showing off his big muscular arms covered in full sleeve tattoos on both arms. "
        "The shirt is unbuttoned over a dark tank top. Blue jeans and combat boots. "
        "He is firing a shotgun one-handed into a zombie at close range, "
        "the blast tearing through the zombie's shoulder and spraying dark red blood and chunks of flesh. "
        "With his other hand he shoves a second zombie back by the face. "
        "A third zombie staggers nearby with bullet holes in its chest leaking blood. "
        "The zombies have grey rotting skin, milky dead eyes, torn bloody clothing, exposed wounds. "
        "Shell casing mid-air, muzzle flash lighting up the scene. "
        "Destroyed urban street behind him, burning cars, crumbling buildings, "
        "rubble and glass on the ground, thick smoke. "
        "He looks completely in control, powerful and unfazed. "
        "Dynamic action pose, slight low angle looking up at him, dramatic red sky lighting, "
        "wide cinematic composition, 16:9 aspect ratio."
    ),
    "short": "Muscular bearded man with sunglasses and medium black hair firing shotgun at zombies, animated cel-shaded action"
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


def main():
    print("RickArena V3 — Rick Redo #2 (medium hair fix)")

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
        "3": {"class_type": "VAELoader", "inputs": {"vae_name": "ae.safetensors"}},
        "4": {
            "class_type": "CLIPTextEncodeFlux",
            "inputs": {
                "clip_l": PROMPT["detailed"],
                "t5xxl": PROMPT["detailed"],
                "guidance": 3.5, "clip": ["2", 0]
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
            "inputs": {"filename_prefix": "rickarena_v3_rick-action-redo2", "images": ["7", 0]}
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
            "inputs": {"filename_prefix": "rickarena_v3_rick-action-redo2_upscaled", "images": ["11", 0]}
        }
    }

    print("[QUEUE] rick-action-redo2")
    prompt_id = queue_prompt(api_workflow)
    print(f"  -> Queued: {prompt_id}")
    print("Will complete after current queue finishes.")


if __name__ == "__main__":
    main()
