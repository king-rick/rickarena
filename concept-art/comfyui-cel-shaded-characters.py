#!/usr/bin/env python3
"""
RickArena Concept Art V3 Generator
Generates 4 character concept art pieces in animated cel-shaded style
matching the Mason DJ reference image.
Uses ComfyUI API with Flux Dev + RealESRGAN 4x upscale.
"""

import json
import urllib.request
import time
import os

COMFYUI_URL = "http://127.0.0.1:8188"

# === UNIFIED STYLE PREFIX ===
# Matches the Mason DJ image: bold outlines, cel-shaded, clean animated style,
# dark moody atmosphere, NOT photorealistic
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

# === CHARACTER PROMPTS (4 images) ===
PROMPTS = {
    "rick-v3": {
        "detailed": (
            f"{STYLE}{SKY}"
            "A tall imposing muscular man in his late 20s standing in a destroyed urban street. "
            "He has long dark wavy hair past his shoulders, a thick dark beard, and wears dark aviator sunglasses. "
            "He is wearing a dark green flannel shirt with sleeves rolled up over a dark tank top, "
            "revealing full sleeve tattoos on both muscular arms. Blue jeans and combat boots. "
            "He holds a pump-action shotgun at the ready, angled across his chest. "
            "His expression is calm and deadly serious behind the sunglasses. "
            "He stands confidently amid rubble, wrecked cars, and crumbling buildings. "
            "Dark blood stains on his clothes and splattered on the ground around him. "
            "A few zombie corpses lie at his feet in the debris. "
            "Dramatic low-angle hero shot, moody red-tinted lighting from the sky above, "
            "wide cinematic composition, 16:9 aspect ratio."
        ),
        "short": "Tall bearded man with sunglasses and shotgun in zombie apocalypse, animated cel-shaded illustration"
    },
    "dan-v3": {
        "detailed": (
            f"{STYLE}{SKY}"
            "A man in his mid-30s with short dirty blonde hair and a slight receding hairline, "
            "not bald, just a normal short men's haircut that is thinning slightly at the temples. "
            "He has light stubble on his face, a rugged but not old appearance. "
            "He wears a grey t-shirt that is torn and dirty, blue jeans, and boots. "
            "He is in a wide aggressive combat stance on a destroyed city street, "
            "firing a pump-action shotgun directly at a charging zombie in front of him. "
            "Bright muzzle flash illuminates his determined face. "
            "The zombie is taking the blast to its chest, dark red blood erupting from the impact "
            "in a stylized spray, chunks of torn flesh visible. "
            "The street is littered with rubble, destroyed cars, shattered windows. "
            "Puddles on the ground reflect the red sky. "
            "Dynamic action shot, dramatic lighting from the muzzle flash, "
            "wide composition, 16:9 aspect ratio."
        ),
        "short": "Blonde man firing shotgun at zombie on destroyed street, animated cel-shaded illustration, action"
    },
    "jason-v3": {
        "detailed": (
            f"{STYLE}{SKY}"
            "A disheveled man in his early 30s with messy unkempt dark brown hair sticking up in places, "
            "five o'clock shadow on his face, not a full beard. "
            "He wears a dirty dark green jacket over a wrinkled grey t-shirt, brown pants, worn boots. "
            "He looks mildly dazed and hungover, eyes slightly glazed and half-lidded, "
            "not extreme but clearly not fully alert. Subtle dark circles under his eyes. "
            "He is smoking a joint, thin trail of smoke curling up from his mouth. "
            "He stands in the foreground of the image facing the viewer with a look of mild surprise, "
            "as if he just noticed something behind him. "
            "Behind him in the middle distance, a horde of grotesque zombies shambles toward him "
            "down an abandoned city street. The zombies have torn rotting flesh, blood dripping from wounds, "
            "tattered clothing, some with exposed bone. Wrecked cars on both sides of the street. "
            "Dark humor tone, the man is oblivious to the danger creeping up. "
            "Medium shot, centered composition, 16:9 aspect ratio."
        ),
        "short": "Scruffy hungover man smoking joint while zombies approach behind, animated cel-shaded illustration"
    },
    "pj-v3": {
        "detailed": (
            f"{STYLE}{SKY}"
            "A lean athletic man in his late 20s with short blonde hair and a distinctive blonde mustache. "
            "He wears a torn black t-shirt, dark pants, and combat boots. "
            "Both arms are covered in detailed sleeve tattoos from shoulder to wrist, "
            "visible through the torn sleeves. "
            "He is mid-swing with a katana in a powerful horizontal slash, "
            "cutting through a zombie's neck. Dark red blood sprays from the wound in a dramatic arc, "
            "droplets frozen in the air, stylized blood splatter. "
            "The zombie has grey decayed skin, red glowing eyes, tattered body armor, "
            "its head partially severed with torn flesh visible at the cut. "
            "The scene is set in a destroyed urban alley with crumbling brick walls, "
            "rubble and debris scattered on the ground, dark shadows in doorways. "
            "Dynamic action pose with the man's face showing intense focus and aggression. "
            "Dramatic side-lighting, slight motion blur on the katana blade, "
            "wide composition, 16:9 aspect ratio."
        ),
        "short": "Tattooed blonde man slashing zombie with katana, blood spray, animated cel-shaded illustration"
    }
}


def queue_prompt(workflow):
    """Queue a workflow via ComfyUI API and return the prompt_id."""
    data = json.dumps({"prompt": workflow}).encode("utf-8")
    req = urllib.request.Request(
        f"{COMFYUI_URL}/prompt",
        data=data,
        headers={"Content-Type": "application/json"}
    )
    resp = urllib.request.urlopen(req)
    result = json.loads(resp.read())
    return result.get("prompt_id")


def get_history(prompt_id):
    """Check if a prompt has completed."""
    try:
        resp = urllib.request.urlopen(f"{COMFYUI_URL}/history/{prompt_id}")
        history = json.loads(resp.read())
        return history.get(prompt_id)
    except Exception:
        return None


def wait_for_completion(prompt_id, name, timeout=600):
    """Wait for a prompt to finish, with progress updates."""
    print(f"  Waiting for '{name}' to finish...")
    start = time.time()
    while time.time() - start < timeout:
        history = get_history(prompt_id)
        if history and history.get("status", {}).get("completed", False):
            return history
        if history and "outputs" in history:
            return history
        time.sleep(5)
    print(f"  TIMEOUT: '{name}' did not complete within {timeout}s")
    return None


def build_workflow(name, prompt_data):
    """Build a ComfyUI API workflow with the given prompt."""
    api_workflow = {
        "1": {
            "class_type": "UNETLoader",
            "inputs": {
                "unet_name": "flux1-dev.safetensors",
                "weight_dtype": "default"
            }
        },
        "2": {
            "class_type": "DualCLIPLoader",
            "inputs": {
                "clip_name1": "clip_l.safetensors",
                "clip_name2": "t5xxl_fp8_e4m3fn.safetensors",
                "type": "flux",
                "device": "default"
            }
        },
        "3": {
            "class_type": "VAELoader",
            "inputs": {
                "vae_name": "ae.safetensors"
            }
        },
        "4": {
            "class_type": "CLIPTextEncodeFlux",
            "inputs": {
                "clip_l": prompt_data["detailed"],
                "t5xxl": prompt_data["detailed"],
                "guidance": 3.5,
                "clip": ["2", 0]
            }
        },
        "5": {
            "class_type": "EmptySD3LatentImage",
            "inputs": {
                "width": 1344,
                "height": 768,
                "batch_size": 1
            }
        },
        "6": {
            "class_type": "KSampler",
            "inputs": {
                "seed": int(time.time() * 1000) % (2**32),
                "control_after_generate": "randomize",
                "steps": 28,
                "cfg": 3.5,
                "sampler_name": "euler",
                "scheduler": "simple",
                "denoise": 1.0,
                "model": ["1", 0],
                "positive": ["4", 0],
                "negative": ["4", 0],
                "latent_image": ["5", 0]
            }
        },
        "7": {
            "class_type": "VAEDecode",
            "inputs": {
                "samples": ["6", 0],
                "vae": ["3", 0]
            }
        },
        "8": {
            "class_type": "SaveImage",
            "inputs": {
                "filename_prefix": f"rickarena_v3_{name}",
                "images": ["7", 0]
            }
        },
        "10": {
            "class_type": "UpscaleModelLoader",
            "inputs": {
                "model_name": "RealESRGAN_x4.pth"
            }
        },
        "11": {
            "class_type": "ImageUpscaleWithModel",
            "inputs": {
                "upscale_model": ["10", 0],
                "image": ["7", 0]
            }
        },
        "12": {
            "class_type": "SaveImage",
            "inputs": {
                "filename_prefix": f"rickarena_v3_{name}_upscaled",
                "images": ["11", 0]
            }
        }
    }
    return api_workflow


def main():
    print("=" * 60)
    print("RickArena Concept Art V3 — Animated Cel-Shaded Style")
    print("(Matching Mason DJ reference image)")
    print("=" * 60)
    print(f"Generating {len(PROMPTS)} images: Rick, Dan, Jason, PJ")
    print(f"Resolution: 1344x768 base -> 5376x3072 upscaled (4x)")
    print(f"Steps: 28, CFG: 3.5, Sampler: euler/simple")
    print()

    prompt_ids = {}

    for name, prompt_data in PROMPTS.items():
        print(f"[QUEUE] {name}")
        workflow = build_workflow(name, prompt_data)
        prompt_id = queue_prompt(workflow)
        if prompt_id:
            prompt_ids[name] = prompt_id
            print(f"  -> Queued: {prompt_id}")
        else:
            print(f"  -> FAILED to queue")
        time.sleep(1)

    print()
    print("All prompts queued. Waiting for completion...")
    print("(Each image takes ~2-4 min to generate + upscale)")
    print()

    for name, pid in prompt_ids.items():
        result = wait_for_completion(pid, name, timeout=600)
        if result:
            print(f"[DONE] {name}")
            outputs = result.get("outputs", {})
            for node_id, node_out in outputs.items():
                if "images" in node_out:
                    for img in node_out["images"]:
                        print(f"  -> {img.get('filename', 'unknown')}")
        else:
            print(f"[FAIL] {name}")

    print()
    print("=" * 60)
    print("Generation complete!")
    print(f"Check ComfyUI output folder for 'rickarena_v3_*' files")
    print("=" * 60)


if __name__ == "__main__":
    main()
