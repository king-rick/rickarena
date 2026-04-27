#!/usr/bin/env python3
"""
RickArena Concept Art V2 Generator
Generates 6 reimagined concept art pieces in Dead Space key art style.
Uses ComfyUI API with Flux Dev + RealESRGAN 4x upscale.
"""

import json
import urllib.request
import urllib.parse
import time
import os
import shutil

COMFYUI_URL = "http://127.0.0.1:8188"
OUTPUT_DIR = os.path.dirname(os.path.abspath(__file__))

# Base workflow template — modify prompt, resolution, seed per image
WORKFLOW_TEMPLATE = {
    "last_node_id": 13,
    "last_link_id": 11,
    "nodes": [
        {
            "id": 1, "type": "UNETLoader", "pos": [0, 0], "size": [300, 80],
            "flags": {}, "order": 0, "mode": 0, "inputs": [],
            "outputs": [{"name": "MODEL", "type": "MODEL", "links": [1], "slot_index": 0}],
            "properties": {"Node name for S&R": "UNETLoader"},
            "widgets_values": ["flux1-dev.safetensors", "default"]
        },
        {
            "id": 2, "type": "DualCLIPLoader", "pos": [0, 130], "size": [300, 122],
            "flags": {}, "order": 1, "mode": 0, "inputs": [],
            "outputs": [{"name": "CLIP", "type": "CLIP", "links": [2], "slot_index": 0}],
            "properties": {"Node name for S&R": "DualCLIPLoader"},
            "widgets_values": ["clip_l.safetensors", "t5xxl_fp8_e4m3fn.safetensors", "flux", "default"]
        },
        {
            "id": 3, "type": "VAELoader", "pos": [0, 300], "size": [300, 60],
            "flags": {}, "order": 2, "mode": 0, "inputs": [],
            "outputs": [{"name": "VAE", "type": "VAE", "links": [7], "slot_index": 0}],
            "properties": {"Node name for S&R": "VAELoader"},
            "widgets_values": ["ae.safetensors"]
        },
        {
            "id": 4, "type": "CLIPTextEncodeFlux", "pos": [400, 0], "size": [400, 200],
            "flags": {}, "order": 3, "mode": 0,
            "inputs": [{"name": "clip", "type": "CLIP", "link": 2}],
            "outputs": [{"name": "CONDITIONING", "type": "CONDITIONING", "links": [3], "slot_index": 0}],
            "properties": {"Node name for S&R": "CLIPTextEncodeFlux"},
            "widgets_values": ["PROMPT_PLACEHOLDER", "SHORT_PROMPT_PLACEHOLDER", 3.5]
        },
        {
            "id": 5, "type": "EmptySD3LatentImage", "pos": [400, 260], "size": [300, 100],
            "flags": {}, "order": 4, "mode": 0, "inputs": [],
            "outputs": [{"name": "LATENT", "type": "LATENT", "links": [5], "slot_index": 0}],
            "properties": {"Node name for S&R": "EmptySD3LatentImage"},
            "widgets_values": [1344, 768, 1]
        },
        {
            "id": 6, "type": "KSampler", "pos": [900, 0], "size": [300, 254],
            "flags": {}, "order": 5, "mode": 0,
            "inputs": [
                {"name": "model", "type": "MODEL", "link": 1},
                {"name": "positive", "type": "CONDITIONING", "link": 3},
                {"name": "negative", "type": "CONDITIONING", "link": None},
                {"name": "latent_image", "type": "LATENT", "link": 5}
            ],
            "outputs": [{"name": "LATENT", "type": "LATENT", "links": [6], "slot_index": 0}],
            "properties": {"Node name for S&R": "KSampler"},
            "widgets_values": [0, "randomize", 28, 3.5, "euler", "simple", 1.0]
        },
        {
            "id": 7, "type": "VAEDecode", "pos": [1300, 0], "size": [200, 60],
            "flags": {}, "order": 6, "mode": 0,
            "inputs": [
                {"name": "samples", "type": "LATENT", "link": 6},
                {"name": "vae", "type": "VAE", "link": 7}
            ],
            "outputs": [{"name": "IMAGE", "type": "IMAGE", "links": [8, 9], "slot_index": 0}],
            "properties": {"Node name for S&R": "VAEDecode"},
            "widgets_values": []
        },
        {
            "id": 8, "type": "SaveImage", "pos": [1550, 0], "size": [400, 400],
            "flags": {}, "order": 7, "mode": 0,
            "inputs": [{"name": "images", "type": "IMAGE", "link": 8}],
            "outputs": [],
            "properties": {"Node name for S&R": "SaveImage"},
            "widgets_values": ["rickarena_v2"]
        },
        {
            "id": 10, "type": "UpscaleModelLoader", "pos": [1300, 150], "size": [300, 60],
            "flags": {}, "order": 8, "mode": 0, "inputs": [],
            "outputs": [{"name": "UPSCALE_MODEL", "type": "UPSCALE_MODEL", "links": [10], "slot_index": 0}],
            "properties": {"Node name for S&R": "UpscaleModelLoader"},
            "widgets_values": ["RealESRGAN_x4.pth"]
        },
        {
            "id": 11, "type": "ImageUpscaleWithModel", "pos": [1300, 260], "size": [300, 60],
            "flags": {}, "order": 9, "mode": 0,
            "inputs": [
                {"name": "upscale_model", "type": "UPSCALE_MODEL", "link": 10},
                {"name": "image", "type": "IMAGE", "link": 9}
            ],
            "outputs": [{"name": "IMAGE", "type": "IMAGE", "links": [11], "slot_index": 0}],
            "properties": {"Node name for S&R": "ImageUpscaleWithModel"},
            "widgets_values": []
        },
        {
            "id": 12, "type": "SaveImage", "pos": [1550, 450], "size": [400, 400],
            "flags": {}, "order": 10, "mode": 0,
            "inputs": [{"name": "images", "type": "IMAGE", "link": 11}],
            "outputs": [],
            "properties": {"Node name for S&R": "SaveImage"},
            "widgets_values": ["rickarena_v2_upscaled"]
        }
    ],
    "links": [
        [1, 1, 0, 6, 0, "MODEL"],
        [2, 2, 0, 4, 0, "CLIP"],
        [3, 4, 0, 6, 1, "CONDITIONING"],
        [5, 5, 0, 6, 3, "LATENT"],
        [6, 6, 0, 7, 0, "LATENT"],
        [7, 3, 0, 7, 1, "VAE"],
        [8, 7, 0, 8, 0, "IMAGE"],
        [9, 7, 0, 11, 1, "IMAGE"],
        [10, 10, 0, 11, 0, "UPSCALE_MODEL"],
        [11, 11, 0, 12, 0, "IMAGE"]
    ],
    "groups": [],
    "config": {},
    "extra": {},
    "version": 0.4
}

# === STYLE PREFIX (applied to all prompts for cohesion) ===
STYLE = (
    "Dead Space concept art style, highly detailed digital painting, "
    "cinematic lighting, muted desaturated palette with deep reds and blacks, "
    "atmospheric haze, volumetric fog, gritty photorealistic rendering with painterly brushwork, "
    "horror game key art, ultra detailed textures on clothing and skin, "
    "blood splatter rendered realistically with dripping and pooling, "
    "industrial post-apocalyptic environment, "
)

SKY = (
    "sky is deep crimson red with layers of dark hazy clouds, "
    "thick smoke and ash particles in the air, faint orange glow on the horizon, "
    "oppressive and suffocating atmosphere, "
)

# === PROMPTS ===
PROMPTS = {
    "dan-shooting-zombie-v2": {
        "detailed": (
            f"{STYLE}{SKY}"
            "A 35-year-old man with short dirty blonde hair and a slight receding hairline, "
            "rugged face with stubble, wearing a dark blue tactical work shirt with rolled sleeves "
            "and worn jeans, combat boots. He is in a wide combat stance on a destroyed urban street, "
            "firing a pump-action shotgun at a charging zombie. Muzzle flash illuminates his face and "
            "the debris around him. The zombie is mid-stride, taking buckshot to the torso with "
            "realistic blood erupting from the impact, chunks of flesh tearing away. "
            "Destroyed cars, rubble, shattered storefronts line the street. Puddles of blood-tinged "
            "water reflect the red sky. Wires hang from destroyed buildings. "
            "Dramatic low angle shot, wide composition, 16:9 aspect ratio."
        ),
        "short": "Man firing shotgun at zombie on destroyed city street, Dead Space concept art, cinematic horror"
    },
    "jason-surprised-zombies-v2": {
        "detailed": (
            f"{STYLE}{SKY}"
            "A disheveled man in his early 30s with messy unkempt dark brown hair and five o'clock shadow, "
            "wearing a dirty wrinkled grey crewneck sweater and dark pants, looking mildly dazed and hungover. "
            "He is smoking a joint, smoke curling from his lips, eyes slightly glazed and half-lidded "
            "with a look of dawning surprise on his face. He stands in the foreground facing the viewer. "
            "Behind him, a horde of grotesque zombies shambles toward him down an abandoned city street. "
            "The zombies have torn flesh, exposed muscle and bone, blood dripping from wounds and mouths, "
            "tattered clothing. Abandoned wrecked cars on both sides. "
            "The man is oblivious to the immediate danger. Dark humor meets genuine horror. "
            "Medium shot, centered composition, 16:9 aspect ratio."
        ),
        "short": "Hungover man smoking while zombies approach behind him, Dead Space concept art, dark humor horror"
    },
    "loading-screen-v2": {
        "detailed": (
            f"{STYLE}{SKY}"
            "Four survivors standing shoulder to shoulder facing the viewer, weapons ready, "
            "in front of a destroyed industrial complex with smokestacks and twisted metal. "
            "Left to right: "
            "First, a tall muscular man with long dark wavy hair past his shoulders, thick beard, "
            "sunglasses, green flannel shirt over a tank top, sleeve tattoos visible, holding a shotgun. "
            "Second, a stocky man with short dirty blonde hair and slight receding hairline, "
            "grey crewneck, holding a pump-action shotgun pointed down. "
            "Third, a lean tall man with short blonde hair and a blonde mustache, "
            "black t-shirt, full sleeve tattoos on both arms, holding a katana at his side. "
            "Fourth, a wiry disheveled man with messy dark hair and scraggly beard, "
            "wearing a worn sport coat over a dirty shirt, holding a flashlight and pistol. "
            "Looming behind them in the red hazy sky, a massive shadowy silhouette of a hulking figure "
            "with glowing purple-neon glasses, barely visible through smoke and clouds. "
            "Epic group hero shot, dramatic lighting from below, 16:9 aspect ratio."
        ),
        "short": "Four armed survivors group shot with shadowy boss behind, Dead Space concept art, epic cinematic"
    },
    "mason-dj-zombies-v2": {
        "detailed": (
            f"{STYLE}"
            "Interior of a massive underground stone dungeon repurposed as a nightclub. "
            "A gigantic green-skinned zombie stands behind a DJ booth on an elevated platform. "
            "He is extremely wide, thick, and heavy-set, built like a refrigerator, massive shoulders "
            "and arms, powerful and imposing but not fat. Short afro hair. "
            "He wears a filthy tank top that reads 'BIG BABY' with a cartoon baby graphic. "
            "His eyes glow bright neon purple behind thick-framed glasses that emit purple neon light. "
            "Two massive steampunk speakers with exposed gears and brass fittings are mounted on his shoulders. "
            "He operates the DJ mixer with his huge green hands. "
            "Below him, a crowd of zombies in various states of decay dance and writhe, "
            "blood and gore on many of them, some missing limbs but still dancing. "
            "Colored stage lights cut through fog: purple, magenta, green beams. "
            "Stone walls, iron gates, dungeon architecture. Visceral and surreal. "
            "Wide establishing shot, dramatic club lighting, 16:9 aspect ratio."
        ),
        "short": "Giant green zombie DJ in underground dungeon nightclub with zombie crowd, Dead Space concept art"
    },
    "pj-slashing-zombie-v2": {
        "detailed": (
            f"{STYLE}{SKY}"
            "A lean athletic man in his late 20s with short blonde hair and a blonde mustache, "
            "wearing a torn black t-shirt, dark tactical pants, and combat boots. "
            "Both arms are covered in detailed sleeve tattoos from shoulder to wrist. "
            "He is mid-swing with a katana, slashing through a zombie's neck in a devastating horizontal cut. "
            "Realistic blood sprays from the wound in an arc, droplets frozen in the air, "
            "the zombie's head partially severed with exposed vertebrae and torn muscle visible. "
            "The zombie wears tattered body armor, has red glowing eyes, grey decayed skin. "
            "Destroyed urban alley, crumbling brick buildings, rubble and debris on the ground. "
            "Dynamic action pose, the man's face intense and focused. "
            "Dramatic side-lit composition, motion blur on the blade, 16:9 aspect ratio."
        ),
        "short": "Tattooed man slashing zombie with katana, blood spray, Dead Space concept art, brutal action"
    },
    "scaryboi-intro-v2": {
        "detailed": (
            f"{STYLE}{SKY}"
            "A colossal muscular zombie boss walking slowly toward the viewer through an industrial wasteland. "
            "He is shirtless with grey-green decayed skin stretched over massive muscles, "
            "covered in tribal tattoos across his chest, arms, and shoulders. "
            "Thick dark beard on a square jaw. His eyes glow bright crimson red, piercing through the haze. "
            "He is enormous, towering and wide, every muscle defined and scarred. "
            "Deep gashes and old wounds across his torso with dried blood. "
            "Behind him, a destroyed industrial complex: rusted smokestacks, collapsed cranes, "
            "oil derricks, twisted rebar and concrete. Thick ground fog swirls around his legs. "
            "He walks with slow unstoppable menace, fists clenched at his sides. "
            "Low angle hero shot looking up at him, emphasizing his terrifying scale, 16:9 aspect ratio."
        ),
        "short": "Massive muscular zombie boss walking through industrial wasteland, Dead Space concept art, menacing"
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
        # Check status_str for completion
        if history and "outputs" in history:
            return history
        time.sleep(5)
    print(f"  TIMEOUT: '{name}' did not complete within {timeout}s")
    return None


def build_workflow(name, prompt_data):
    """Build a workflow from the template with the given prompt."""
    wf = json.loads(json.dumps(WORKFLOW_TEMPLATE))  # deep copy

    # Convert node list to API format (keyed by node id string)
    api_workflow = {}
    for node in wf["nodes"]:
        node_id = str(node["id"])
        api_node = {
            "class_type": node["type"],
            "inputs": {}
        }

        # Map widget values to input names based on node type
        if node["type"] == "UNETLoader":
            api_node["inputs"]["unet_name"] = node["widgets_values"][0]
            api_node["inputs"]["weight_dtype"] = node["widgets_values"][1]
        elif node["type"] == "DualCLIPLoader":
            api_node["inputs"]["clip_name1"] = node["widgets_values"][0]
            api_node["inputs"]["clip_name2"] = node["widgets_values"][1]
            api_node["inputs"]["type"] = node["widgets_values"][2]
            if len(node["widgets_values"]) > 3:
                api_node["inputs"]["device"] = node["widgets_values"][3]
        elif node["type"] == "VAELoader":
            api_node["inputs"]["vae_name"] = node["widgets_values"][0]
        elif node["type"] == "CLIPTextEncodeFlux":
            api_node["inputs"]["clip_l"] = prompt_data["detailed"]
            api_node["inputs"]["t5xxl"] = prompt_data["detailed"]
            api_node["inputs"]["guidance"] = 3.5
            api_node["inputs"]["clip"] = ["2", 0]
        elif node["type"] == "EmptySD3LatentImage":
            api_node["inputs"]["width"] = 1344
            api_node["inputs"]["height"] = 768
            api_node["inputs"]["batch_size"] = 1
        elif node["type"] == "KSampler":
            api_node["inputs"]["seed"] = int(time.time() * 1000) % (2**32)
            api_node["inputs"]["control_after_generate"] = "randomize"
            api_node["inputs"]["steps"] = 28
            api_node["inputs"]["cfg"] = 3.5
            api_node["inputs"]["sampler_name"] = "euler"
            api_node["inputs"]["scheduler"] = "simple"
            api_node["inputs"]["denoise"] = 1.0
            api_node["inputs"]["model"] = ["1", 0]
            api_node["inputs"]["positive"] = ["4", 0]
            api_node["inputs"]["negative"] = ["4", 0]  # no negative for Flux
            api_node["inputs"]["latent_image"] = ["5", 0]
        elif node["type"] == "VAEDecode":
            api_node["inputs"]["samples"] = ["6", 0]
            api_node["inputs"]["vae"] = ["3", 0]
        elif node["type"] == "SaveImage":
            prefix = f"rickarena_v2_{name}" if node["id"] == 8 else f"rickarena_v2_{name}_upscaled"
            api_node["inputs"]["filename_prefix"] = prefix
            api_node["inputs"]["images"] = ["7", 0] if node["id"] == 8 else ["11", 0]
        elif node["type"] == "UpscaleModelLoader":
            api_node["inputs"]["model_name"] = node["widgets_values"][0]
        elif node["type"] == "ImageUpscaleWithModel":
            api_node["inputs"]["upscale_model"] = ["10", 0]
            api_node["inputs"]["image"] = ["7", 0]

        api_workflow[node_id] = api_node

    return api_workflow


def main():
    print("=" * 60)
    print("RickArena Concept Art V2 — Dead Space Style")
    print("=" * 60)
    print(f"Generating {len(PROMPTS)} images via ComfyUI Flux Dev")
    print(f"Resolution: 1344x768 base → 5376x3072 upscaled (4x)")
    print(f"Steps: 28, CFG: 3.5, Sampler: euler/simple")
    print()

    prompt_ids = {}

    for name, prompt_data in PROMPTS.items():
        print(f"[QUEUE] {name}")
        workflow = build_workflow(name, prompt_data)
        prompt_id = queue_prompt(workflow)
        if prompt_id:
            prompt_ids[name] = prompt_id
            print(f"  → Queued: {prompt_id}")
        else:
            print(f"  → FAILED to queue")
        # Small delay between queuing
        time.sleep(1)

    print()
    print("All prompts queued. Waiting for completion...")
    print("(Each image takes ~2-4 min to generate + upscale)")
    print()

    for name, pid in prompt_ids.items():
        result = wait_for_completion(pid, name, timeout=600)
        if result:
            print(f"[DONE] {name}")
            # Try to find output filenames
            outputs = result.get("outputs", {})
            for node_id, node_out in outputs.items():
                if "images" in node_out:
                    for img in node_out["images"]:
                        print(f"  → {img.get('filename', 'unknown')}")
        else:
            print(f"[FAIL] {name}")

    print()
    print("=" * 60)
    print("Generation complete!")
    print(f"Check ComfyUI output folder for 'rickarena_v2_*' files")
    print("Upscaled versions have '_upscaled' suffix")
    print("=" * 60)


if __name__ == "__main__":
    main()
