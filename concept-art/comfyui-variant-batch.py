#!/usr/bin/env python3
"""
RickArena Concept Art V4 — Variant batch
3 Rick, 3 Dan, 3 PJ, 4 Jason (scruffier/older/high)
All action shots, animated cel-shaded style.
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

# Character base descriptions
RICK_BASE = (
    "A tall imposing muscular man in his late 20s. "
    "He has a regular medium-length men's haircut, black wavy hair, not long, not short, "
    "just a normal everyday men's hairstyle with some volume on top, slightly messy from combat. "
    "NOT long hair, NOT chin-length, NOT shoulder-length. "
    "Thick dark full beard. Dark aviator sunglasses. "
    "He wears a green flannel shirt with the sleeves rolled up high above his elbows, "
    "showing off his big muscular arms covered in full sleeve tattoos on both arms. "
    "The shirt is unbuttoned over a dark tank top. Blue jeans and combat boots. "
)

DAN_BASE = (
    "A man in his mid-30s with short dirty blonde hair and a slight receding hairline "
    "at the temples, not bald, just a normal short men's haircut thinning slightly. "
    "Light stubble, rugged but not old. "
    "He wears a torn dirty grey t-shirt, blue jeans, and boots. "
)

JASON_BASE = (
    "A scruffy rough-looking man in his mid-30s, looks older than he is. "
    "Messy unkempt dark brown hair sticking up and matted in places, greasy looking. "
    "Prominent five o'clock shadow bordering on scruff, patchy and uneven. "
    "Baggy dark circles under his bloodshot slightly glazed half-lidded eyes, "
    "he clearly looks high or hungover or both, dazed but functional. "
    "Gaunt cheekbones, slightly sunken features, a face that has seen some rough nights. "
    "He wears a dirty wrinkled dark green jacket over a stained grey t-shirt, "
    "brown pants, worn scuffed boots. A lit joint hangs from his mouth. "
)

PJ_BASE = (
    "A lean athletic man in his late 20s with short blonde hair "
    "and a distinctive blonde mustache. "
    "He wears a torn black t-shirt, dark pants, combat boots. "
    "Both arms covered in detailed sleeve tattoos from shoulder to wrist. "
)

PROMPTS = {
    # === RICK x3 ===
    "rick-var1": {
        "detailed": (
            f"{STYLE}{SKY}{RICK_BASE}"
            "He is firing a pump-action shotgun from the hip into a crowd of zombies, "
            "the closest zombie's chest exploding in a spray of dark red blood and bone. "
            "Muzzle flash lights up the fog around him. Two more zombies stagger from the blast. "
            "A zombie on the ground grabs at his boot, he is stomping its skull with his other foot. "
            "Destroyed city street, overturned bus in the background engulfed in flames, "
            "rubble and bodies scattered everywhere. "
            "He looks completely unfazed, like this is routine. "
            "Dynamic wide action shot, low angle, 16:9 aspect ratio."
        ),
        "short": "Muscular bearded man shotgunning zombies from the hip, animated cel-shaded action"
    },
    "rick-var2": {
        "detailed": (
            f"{STYLE}{SKY}{RICK_BASE}"
            "He stands on top of a wrecked car, firing dual pistols down into a swarm of zombies below. "
            "Both guns blazing with muzzle flashes, shell casings raining down. "
            "Zombies below are getting riddled with bullets, blood spraying from multiple impacts, "
            "one zombie's jaw shot clean off, another with holes punched through its torso. "
            "The horde surrounds the car, dozens of rotting hands reaching up toward him. "
            "Burning buildings on both sides of the street, thick black smoke mixing with the red sky. "
            "His flannel billows in the heat, tattoos on full display. "
            "He looks down at them with cold confidence behind his sunglasses. "
            "Epic elevated action shot, dramatic lighting from fires below, 16:9 aspect ratio."
        ),
        "short": "Bearded man standing on car firing dual pistols into zombie horde below, animated cel-shaded action"
    },
    "rick-var3": {
        "detailed": (
            f"{STYLE}{SKY}{RICK_BASE}"
            "Close-quarters combat in a narrow destroyed alley. "
            "He has an SMG in one hand firing a burst into a zombie's face at point-blank range, "
            "the zombie's head snapping back with blood erupting from the exit wound. "
            "With his other arm he has a second zombie in a headlock, about to snap its neck. "
            "A third zombie charges from the darkness of a doorway behind them. "
            "Brick walls on both sides are splattered with old blood stains. "
            "Trash, debris, a flickering broken neon sign overhead casting colored light. "
            "Tight claustrophobic scene, gritty and brutal. "
            "His sunglasses reflect the muzzle flash. Sweat and blood spatter on his forearms. "
            "Intense close-range action shot, dramatic contrast lighting, 16:9 aspect ratio."
        ),
        "short": "Bearded man in alley SMG headshot on zombie while choking another, animated cel-shaded action"
    },

    # === DAN x3 ===
    "dan-var1": {
        "detailed": (
            f"{STYLE}{SKY}{DAN_BASE}"
            "He is racking his shotgun after a devastating blast, spent shell ejecting in the air. "
            "In front of him a zombie is blown backward off its feet, chest cavity ripped open "
            "with dark blood and gore spraying in a wide pattern. "
            "To his left, another zombie lunges with outstretched rotting arms. "
            "Behind him, a pile of zombie corpses he has already cut down, blood pooling around them. "
            "Destroyed intersection, traffic lights dangling, cars piled up. "
            "His face is grim determination, jaw clenched, eyes focused. "
            "Dynamic mid-reload action shot, smoke from the barrel, 16:9 aspect ratio."
        ),
        "short": "Blonde man racking shotgun over blown-apart zombie, animated cel-shaded action"
    },
    "dan-var2": {
        "detailed": (
            f"{STYLE}{SKY}{DAN_BASE}"
            "He dives to one knee, sliding on wet bloody asphalt, firing his shotgun upward "
            "into a massive zombie that towers over him. The blast catches it under the chin, "
            "blowing the top of its head apart in a fountain of dark blood and skull fragments. "
            "Two fast-moving zombies sprint toward him from the right side. "
            "The street is wet with rain and blood, reflecting the red sky and muzzle flash. "
            "A crashed helicopter smolders in the background, rotors bent. "
            "Rubble and broken concrete everywhere. "
            "His expression is fierce, teeth bared, fighting for survival. "
            "Dynamic low-angle sliding action shot, 16:9 aspect ratio."
        ),
        "short": "Blonde man sliding on knee shotgunning zombie's head off, animated cel-shaded action"
    },
    "dan-var3": {
        "detailed": (
            f"{STYLE}{SKY}{DAN_BASE}"
            "He stands back-to-back with the chaos, firing a pistol rapidly into approaching zombies. "
            "One zombie takes a headshot, dark blood bursting from the back of its skull, collapsing. "
            "Another zombie gets hit in the kneecap, leg buckling grotesquely as it falls forward. "
            "He holds a flashlight in his off-hand under the pistol, the beam cutting through fog. "
            "Three more zombies emerge from the haze ahead, silhouetted against a distant fire. "
            "Abandoned storefront with shattered windows, overturned shopping cart, scattered debris. "
            "His face is lit by the flashlight beam bouncing off the fog. Calm under pressure. "
            "Dynamic tactical shooting pose, wide shot, 16:9 aspect ratio."
        ),
        "short": "Blonde man firing pistol with flashlight at zombies in fog, animated cel-shaded action"
    },

    # === JASON x4 ===
    "jason-var1": {
        "detailed": (
            f"{STYLE}{SKY}{JASON_BASE}"
            "He swings a massive sledgehammer overhead and brings it crashing down onto a zombie's skull, "
            "the head caving in completely with a sickening splatter of dark blood and brain matter. "
            "The zombie's body crumples under the force. Blood sprays up onto his jacket and face. "
            "Two zombies close in from the sides, reaching for him with rotting clawed hands. "
            "He looks annoyed more than scared, like this is interrupting his high. "
            "Joint still lit in the corner of his mouth, smoke curling up past his glazed eyes. "
            "Destroyed parking lot, abandoned cars with smashed windows, a dumpster overturned. "
            "Brutal overhead smash action shot, dramatic top-down lighting, 16:9 aspect ratio."
        ),
        "short": "Scruffy hungover man crushing zombie skull with sledgehammer, joint in mouth, animated action"
    },
    "jason-var2": {
        "detailed": (
            f"{STYLE}{SKY}{JASON_BASE}"
            "He leans against a wrecked car casually, smoking his joint with one hand, "
            "while lazily firing a pistol with the other hand at zombies stumbling toward him. "
            "One zombie takes a bullet through the eye socket, dark blood spraying out the back of its head. "
            "Another zombie nearby has its kneecap blown out and is falling face-first to the ground. "
            "His posture is slouched and unbothered, shooting almost without looking. "
            "His eyes are red-rimmed and half-closed, he looks completely stoned. "
            "Zombie bodies piled around the car already. "
            "Gas station in the background, one pump on fire, flickering orange light. "
            "Darkly comedic action shot, casual violence, 16:9 aspect ratio."
        ),
        "short": "Stoned scruffy man casually leaning on car shooting zombies with pistol, animated dark comedy"
    },
    "jason-var3": {
        "detailed": (
            f"{STYLE}{SKY}{JASON_BASE}"
            "He is mid-swing with the sledgehammer in a wide horizontal arc, "
            "smashing through two zombies at once. The first zombie's ribcage caves in, "
            "ribs snapping outward with blood spraying. The second zombie's arm is completely severed "
            "by the force, flying off with a trail of dark blood. "
            "He stumbles slightly, off-balance from the heavy swing, looking disheveled and exhausted. "
            "Joint somehow still clenched between his teeth. His jacket is torn and bloodstained. "
            "A zombie grabs his jacket from behind, pulling at the fabric. "
            "Narrow street between row houses, boarded-up windows, graffiti on walls. "
            "Chaotic mid-swing action shot, motion blur on the hammer, 16:9 aspect ratio."
        ),
        "short": "Disheveled man swinging sledgehammer through two zombies, joint in teeth, animated action"
    },
    "jason-var4": {
        "detailed": (
            f"{STYLE}{SKY}{JASON_BASE}"
            "He sits on the hood of a destroyed car, legs dangling, taking a long drag from his joint "
            "while holding a smoking shotgun loosely in his other hand. "
            "Around the car, freshly killed zombies are piled everywhere, blood pooling on the asphalt. "
            "One zombie is still twitching, reaching weakly toward him. "
            "He exhales a thick cloud of smoke and stares at the reaching zombie with tired annoyed eyes, "
            "about to raise the shotgun to finish it off. "
            "His face is haggard, stubble thicker than the others, dark circles prominent. "
            "He looks like he hasn't slept in days. His clothes are soaked in blood and grime. "
            "Destroyed downtown street, tall buildings with blown-out windows, "
            "a distant building on fire lighting up the hazy red sky. "
            "Post-battle breather moment with lingering threat, cinematic wide shot, 16:9 aspect ratio."
        ),
        "short": "Exhausted scruffy man smoking on car surrounded by dead zombies, one still reaching, animated"
    },

    # === PJ x3 ===
    "pj-var1": {
        "detailed": (
            f"{STYLE}{SKY}{PJ_BASE}"
            "He is mid-air in a leaping slash, katana raised overhead coming down in a diagonal cut "
            "onto a large armored zombie. The blade connects with the zombie's shoulder, "
            "cutting deep through the armor and flesh, dark blood erupting from the gash. "
            "Below him, a zombie he just sliced is split from neck to navel, "
            "the two halves separating with blood and organs spilling. "
            "Two more zombies charge from the right with glowing red eyes. "
            "His face is locked in a fierce battle cry, teeth bared, eyes intense. "
            "Destroyed rooftop of a building, city skyline burning in the background. "
            "Dramatic aerial action shot, katana gleaming with blood, 16:9 aspect ratio."
        ),
        "short": "Tattooed blonde man leaping katana slash onto zombie, aerial action, animated cel-shaded"
    },
    "pj-var2": {
        "detailed": (
            f"{STYLE}{SKY}{PJ_BASE}"
            "He stands in a low combat stance in the middle of a circle of zombies closing in. "
            "He has just completed a spinning slash, katana extended to the side dripping with blood. "
            "Three zombies around him are in various states of being cut apart: "
            "one decapitated with the head mid-air and blood fountaining from the neck stump, "
            "one with a deep slash across its midsection spilling its guts, "
            "one with both arms severed at the elbows, stumps spraying blood. "
            "More zombies press in from the darkness beyond. "
            "Blood is splattered across his face, arms, and shirt. His eyes are cold and focused. "
            "Town square with a cracked fountain, dead trees, overturned benches. "
            "360-degree combat action shot, dramatic circular composition, 16:9 aspect ratio."
        ),
        "short": "Tattooed man in center of zombie circle after spinning katana slash, gore everywhere, animated"
    },
    "pj-var3": {
        "detailed": (
            f"{STYLE}{SKY}{PJ_BASE}"
            "He sprints down a narrow alley, katana in one hand, pistol in the other. "
            "He fires the pistol behind him without looking, the bullet catching a pursuing zombie "
            "in the forehead, blood bursting from the back of its skull. "
            "Ahead of him, a zombie blocks the alley exit. He extends the katana forward mid-run, "
            "about to impale it straight through the chest. "
            "Zombie arms reach from broken windows on both sides of the alley. "
            "The walls are narrow and claustrophobic, old brick, fire escapes above. "
            "Blood trails on the ground from previous kills. "
            "His face is determined, full sprint, blonde mustache visible in the red light. "
            "Dynamic chase action shot, strong forward motion, 16:9 aspect ratio."
        ),
        "short": "Tattooed blonde man sprinting through alley with katana and pistol, shooting zombie behind, animated"
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
    print("=" * 60)
    print("RickArena V4 — Full Variant Batch")
    print(f"  3 Rick + 3 Dan + 4 Jason + 3 PJ = {len(PROMPTS)} images")
    print("=" * 60)

    for name, prompt_data in PROMPTS.items():
        print(f"[QUEUE] {name}")
        workflow = build_workflow(name, prompt_data)
        prompt_id = queue_prompt(workflow)
        if prompt_id:
            print(f"  -> {prompt_id}")
        else:
            print(f"  -> FAILED")
        time.sleep(0.5)

    print()
    print(f"All {len(PROMPTS)} queued. They'll generate sequentially.")
    print("Check ComfyUI output for 'rickarena_v4_*' files when done.")


if __name__ == "__main__":
    main()
