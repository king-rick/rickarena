#!/usr/bin/env python3
"""
RickArena Concept Art V4 — Jason redo
Shaggy-from-Scooby-Doo energy. Smoking, wide-eyed surprise, horde behind him.
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
    "jason-surprise-v4a": {
        "detailed": (
            f"{STYLE}{SKY}"
            "A scruffy man in his mid-30s standing in the foreground facing the viewer on a destroyed city street. "
            "He has messy unkempt dark brown hair with volume on top, sticking up in places. "
            "Short scruffy facial hair, a five o'clock shadow, not a full beard. "
            "He is holding a lit joint up to his mouth with one hand, smoke curling from the tip. "
            "His eyes are wide open in sudden shock and surprise, eyebrows raised high, "
            "mouth slightly open in a classic comedic 'oh no' expression. "
            "He has the energy of Shaggy from Scooby-Doo realizing there are monsters behind him. "
            "His pupils are slightly dilated, he is clearly stoned. "
            "He wears a dirty wrinkled dark green jacket over a grey t-shirt, brown pants, worn boots. "
            "His posture is still relaxed and slouched from smoking, he hasn't moved yet, "
            "he has only just turned his head slightly and noticed the danger. "
            "Behind him in the background, a massive horde of zombies charges toward him down the street. "
            "Dozens of zombies running and shambling, a huge crowd filling the entire width of the street, "
            "some fast runners in front, slower shamblers behind, all sprinting at him. "
            "The zombies have grey rotting skin, torn bloody clothing, snarling mouths, "
            "glowing eyes, some missing limbs, blood on their hands and faces. "
            "The horde is still several feet behind him but closing fast. "
            "Destroyed urban street with wrecked abandoned cars on both sides, "
            "crumbling buildings, broken windows, rubble on the ground, "
            "distant fires glowing through the haze. "
            "He is the only living human in the scene. All enemies are zombies, undead creatures. "
            "Centered composition, the man large in the foreground, the zombie horde filling the background, "
            "wide cinematic shot, 16:9 aspect ratio."
        ),
        "short": "Stoned scruffy man with joint suddenly noticing zombie horde behind him, Shaggy Scooby-Doo surprise, animated"
    },
    "jason-surprise-v4b": {
        "detailed": (
            f"{STYLE}{SKY}"
            "A scruffy disheveled man in his mid-30s in the foreground of the image facing the viewer. "
            "Messy dark brown hair sticking up, five o'clock shadow scruff on his jaw. "
            "He holds a smoking joint up near his mouth with his right hand, smoke wisping upward. "
            "His expression is pure comedic terror, eyes bugged wide open like a cartoon character, "
            "one eyebrow higher than the other, jaw dropped, the look of someone who just realized "
            "they are in deep trouble. Shaggy from Scooby-Doo energy. "
            "His other hand is starting to reach back for his sledgehammer strapped to his back, "
            "but he hasn't grabbed it yet, he's frozen in that split-second of realization. "
            "His body is still loose and slouched, caught completely off guard. "
            "He wears a dirty dark green jacket open over a stained grey t-shirt, brown pants, scuffed boots. "
            "Behind him stretching into the distance, an enormous horde of undead zombies floods the street, "
            "running toward him from the background. The front runners are fast and aggressive, "
            "arms pumping, mouths open showing rotten teeth, eyes glowing. "
            "The mass of zombies fills the street from building to building, dozens and dozens of them, "
            "a terrifying wall of rotting flesh and blood closing the distance. "
            "Some zombies have exposed ribs, others drag broken legs, all covered in blood and decay. "
            "Destroyed city street, overturned cars, smashed storefronts, rubble, smoke and haze. "
            "No other humans in the scene, only the man and the zombie horde. "
            "Centered composition with the man prominent in foreground, horde in background, "
            "wide cinematic shot, 16:9 aspect ratio."
        ),
        "short": "Disheveled stoned man bug-eyed surprise at massive zombie horde charging behind him, animated cel-shaded"
    },
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
                "seed": int(time.time() * 1000 + hash(name)) % (2**32),
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
            "inputs": {"filename_prefix": f"rickarena_v4_{name}", "images": ["7", 0]}
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
            "inputs": {"filename_prefix": f"rickarena_v4_{name}_upscaled", "images": ["11", 0]}
        }
    }


def main():
    print("RickArena V4 — Jason Redo (Shaggy surprise + zombie horde)")
    for name, prompt_data in PROMPTS.items():
        print(f"[QUEUE] {name}")
        workflow = build_workflow(name, prompt_data)
        prompt_id = queue_prompt(workflow)
        print(f"  -> {prompt_id}")
        time.sleep(0.5)
    print("Queued. Check output for 'rickarena_v4_jason-surprise-*' files.")


if __name__ == "__main__":
    main()
