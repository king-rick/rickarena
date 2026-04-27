#!/usr/bin/env python3
"""
RickArena Concept Art V3 — Dan, Jason, PJ action shots
All characters actively fighting/killing zombies in intense combat.
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

PROMPTS = {
    "dan-action-v3": {
        "detailed": (
            f"{STYLE}{SKY}"
            "Intense action shot of a man in his mid-30s with short dirty blonde hair and a slight "
            "receding hairline at the temples, light stubble, rugged but not old. "
            "He wears a torn dirty grey t-shirt, blue jeans, and boots. "
            "He is blasting a pump-action shotgun point-blank into a zombie's face, "
            "the zombie's head exploding in a burst of dark red blood and chunks of rotting flesh, "
            "skull fragments and gore spraying outward from the blast. "
            "A second zombie lunges at him from the left, arms outstretched with decayed clawed hands. "
            "A third zombie crawls on the ground behind him, missing its legs, dragging a blood trail. "
            "The zombies have grey-green rotting skin, milky dead eyes, torn clothing, exposed bone and muscle. "
            "He is yelling, face lit by the muzzle flash, shotgun recoil pushing his shoulder back. "
            "Shell casing ejecting from the gun. "
            "Destroyed urban street, overturned burning car in the background, "
            "rubble, broken glass, blood pooling on the cracked asphalt. "
            "Dynamic aggressive action pose, camera slightly low looking up, "
            "wide cinematic composition, 16:9 aspect ratio."
        ),
        "short": "Blonde man blasting zombie with shotgun point blank, gore explosion, animated cel-shaded action"
    },
    "jason-action-v3": {
        "detailed": (
            f"{STYLE}{SKY}"
            "Intense action shot of a disheveled man in his early 30s with messy unkempt dark brown hair, "
            "five o'clock shadow, subtle dark circles under his slightly glazed half-lidded eyes, "
            "looking like he just woke up from a hangover but is now fighting for his life. "
            "He wears a dirty dark green jacket over a wrinkled grey t-shirt, brown pants, worn boots. "
            "A lit joint hangs from the corner of his mouth, smoke trailing behind him as he moves. "
            "He is swinging a massive sledgehammer in a wide devastating arc, "
            "smashing it into a zombie's ribcage with tremendous force. "
            "The zombie's torso is caving in from the impact, ribs cracking outward, "
            "dark blood and gore bursting from the wound. The zombie's body is bending unnaturally. "
            "Two more zombies close in from behind, reaching for him with rotting hands. "
            "The zombies have decayed grey skin, missing chunks of flesh, blood-matted hair, torn clothes. "
            "His expression is a mix of annoyance and adrenaline, like this is ruining his buzz. "
            "Destroyed city intersection, traffic light dangling from wires, smashed windows, "
            "a body slumped against a car in the background. "
            "Dynamic mid-swing action pose, dramatic red lighting from the sky, "
            "wide cinematic composition, 16:9 aspect ratio."
        ),
        "short": "Scruffy hungover man smashing zombie with sledgehammer, joint in mouth, animated cel-shaded action"
    },
    "pj-action-v3": {
        "detailed": (
            f"{STYLE}{SKY}"
            "Intense action shot of a lean athletic man in his late 20s with short blonde hair "
            "and a distinctive blonde mustache. "
            "He wears a torn black t-shirt, dark pants, combat boots. "
            "Both arms covered in detailed sleeve tattoos from shoulder to wrist. "
            "He is in the middle of a vicious katana combo, having just sliced through one zombie "
            "and now mid-slash into a second. "
            "The first zombie behind him is split diagonally from shoulder to hip, "
            "the two halves separating with dark blood pouring from the clean cut, organs spilling. "
            "The second zombie in front of him is catching the blade across its throat, "
            "a spray of dark red blood arcing through the air from the slash, "
            "the zombie's head tilting back from the force of the cut. "
            "A third zombie approaches from the right, snarling. "
            "The zombies have grey rotting flesh, glowing red eyes, tattered armor and clothing. "
            "His face is locked in fierce determination, teeth gritted, eyes focused. "
            "The katana blade has blood trailing off it in a motion streak. "
            "Dark narrow alley between crumbling brick buildings, fire escape above, "
            "trash and debris on the ground, blood splattered on the walls. "
            "Dynamic dual-kill action pose, dramatic side-lighting, slight motion blur on blade, "
            "wide cinematic composition, 16:9 aspect ratio."
        ),
        "short": "Tattooed blonde man slicing through multiple zombies with katana, blood arcs, animated cel-shaded action"
    }
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


def wait_for_completion(prompt_id, name, timeout=600):
    print(f"  Waiting for '{name}'...")
    start = time.time()
    while time.time() - start < timeout:
        history = get_history(prompt_id)
        if history and "outputs" in history:
            return history
        time.sleep(5)
    print(f"  TIMEOUT: '{name}'")
    return None


def build_workflow(name, prompt_data):
    return {
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
                "clip_l": prompt_data["detailed"],
                "t5xxl": prompt_data["detailed"],
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
            "inputs": {"filename_prefix": f"rickarena_v3_{name}", "images": ["7", 0]}
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
            "inputs": {"filename_prefix": f"rickarena_v3_{name}_upscaled", "images": ["11", 0]}
        }
    }


def main():
    print("=" * 60)
    print("RickArena V3 — Dan, Jason, PJ Action Shots")
    print("=" * 60)

    prompt_ids = {}
    for name, prompt_data in PROMPTS.items():
        print(f"[QUEUE] {name}")
        workflow = build_workflow(name, prompt_data)
        prompt_id = queue_prompt(workflow)
        if prompt_id:
            prompt_ids[name] = prompt_id
            print(f"  -> Queued: {prompt_id}")
        else:
            print(f"  -> FAILED")
        time.sleep(1)

    print()
    print("Waiting for completion...")
    print()

    for name, pid in prompt_ids.items():
        result = wait_for_completion(pid, name)
        if result:
            print(f"[DONE] {name}")
            for node_id, node_out in result.get("outputs", {}).items():
                if "images" in node_out:
                    for img in node_out["images"]:
                        print(f"  -> {img.get('filename', 'unknown')}")
        else:
            print(f"[FAIL] {name}")

    print()
    print("Done! Check ComfyUI output for 'rickarena_v3_*' files")


if __name__ == "__main__":
    main()
