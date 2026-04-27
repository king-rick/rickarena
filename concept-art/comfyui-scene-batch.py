#!/usr/bin/env python3
"""
RickArena Concept Art V5 — Scene batch
1. Loading screen (4 heroes + Mason boss looming)
2. SCARYBOI intro (smoke entrance)
3. Mason DJ variant
4. Endicott Estate wide shot
5. Title screen (creative, no text)
6. Zombie dog pack
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
    "NOT photorealistic, NOT 3D render, purely 2D animated illustration, "
    "absolutely no text, no words, no letters, no logos, no titles, no watermarks anywhere in the image, "
)

SKY = (
    "deep crimson red sky with layers of dark brooding clouds rendered in animated style, "
    "thick haze and smoke particles, faint orange-red glow on the horizon, "
    "oppressive dark atmosphere, "
)

PROMPTS = {
    # 1. LOADING SCREEN — 4 heroes + Mason boss looming
    "loading-screen-v5": {
        "detailed": (
            f"{STYLE}{SKY}"
            "Four human survivors standing shoulder to shoulder facing the viewer, weapons ready, "
            "on a destroyed industrial street. Dark dramatic scene, heavily shadowed. "
            "Left to right: "
            "First, a tall muscular man with medium-length black wavy hair, thick dark beard, "
            "dark aviator sunglasses, green flannel shirt with sleeves rolled up showing sleeve tattoos "
            "on both muscular arms, dark tank top underneath, blue jeans, combat boots, holding a shotgun. "
            "Second, a man in his mid-30s with short dirty blonde hair and slight receding hairline, "
            "light stubble, grey t-shirt, jeans, boots, holding a pump-action shotgun pointed down. "
            "Third, a lean man with short blonde hair and a blonde mustache, "
            "black t-shirt, full sleeve tattoos both arms, dark pants, holding a katana at his side. "
            "Fourth, a scruffy disheveled man with messy dark brown hair, five o'clock shadow, "
            "dirty dark green jacket over grey t-shirt, brown pants, holding a sledgehammer over his shoulder. "
            "Looming behind and above them in the dark red sky, a massive shadowy silhouette of a "
            "gigantic hulking green-skinned zombie boss. Most of his face and body is obscured by deep shadows "
            "and darkness, only the edge of one side of his face faintly visible in dim red light. "
            "He has a short black afro hairstyle. His thick-framed glasses glow bright neon purple, "
            "the purple light illuminating the fog and haze around his silhouette, "
            "the glasses are the brightest element in the upper half of the image. "
            "The boss is enormous, wide, built like a refrigerator, barely visible except for the glowing glasses "
            "and a hint of his massive frame in the shadows. "
            "Epic group hero shot, dramatic underlighting on the four heroes, "
            "dark oppressive atmosphere, wide cinematic composition, 16:9 aspect ratio."
        ),
        "short": "Four armed survivors group shot with shadowy green zombie boss with glowing purple glasses looming behind, animated"
    },

    # 2. SCARYBOI — smoke entrance
    "scaryboi-smoke-v5": {
        "detailed": (
            f"{STYLE}{SKY}"
            "A colossal muscular zombie boss emerging from thick swirling smoke and fog. "
            "He is shirtless with grey-green decayed skin stretched over massive defined muscles, "
            "covered in tribal tattoos across his chest, arms, and shoulders. "
            "Thick dark beard on a square jaw. His eyes glow bright crimson red, piercing through the haze. "
            "He is enormous, towering and wide, every muscle scarred and battle-worn. "
            "Deep gashes and old wounds across his torso with dried blood. "
            "His lower body from the waist down is completely engulfed in thick billowing smoke and fog, "
            "he is materializing out of the smoke as if appearing from nowhere. "
            "Dense swirling smoke wraps around his legs and hips, tendrils of smoke curl up around his torso. "
            "The smoke is dark grey and purple-tinged, supernatural and ominous. "
            "Behind him, a destroyed industrial wasteland: rusted smokestacks, collapsed cranes, "
            "twisted rebar, but all partially obscured by the massive cloud of smoke he emerges from. "
            "He walks forward with slow unstoppable menace, fists clenched at his sides. "
            "Low angle hero shot looking up at him, emphasizing his terrifying scale, "
            "the smoke making his entrance feel supernatural and dreadful, "
            "wide cinematic composition, 16:9 aspect ratio."
        ),
        "short": "Massive muscular zombie boss emerging from supernatural smoke in industrial wasteland, animated cel-shaded"
    },

    # 3. MASON DJ VARIANT
    "mason-dj-v5": {
        "detailed": (
            f"{STYLE}"
            "Interior of a massive underground stone dungeon repurposed as a nightclub. "
            "A gigantic green-skinned zombie stands behind a DJ booth on an elevated stone platform. "
            "He is extremely wide, thick, and heavy-set, built like a refrigerator, "
            "massive shoulders and arms, powerful and imposing but not fat or obese, just huge and solid. "
            "He has a short black afro hairstyle. "
            "He wears a dark tank top that reads 'BIG BABY' in dripping horror font. "
            "A thick gold chain around his neck. "
            "His thick-framed glasses glow bright neon purple, illuminating his face with purple light. "
            "Two large speakers with exposed gears and brass fittings sit on either side of the booth. "
            "He operates the DJ mixer with his huge green hands, looking menacing and focused. "
            "Below him on the dungeon floor, a crowd of zombies in various states of decay dance and move, "
            "some with blood and gore on them, some missing limbs but still moving to the beat. "
            "Colored stage lights cut through dense fog: purple, magenta, and green beams slicing the darkness. "
            "Stone walls, iron gates, gothic arched ceilings, dungeon architecture. "
            "Blood splatter on the stone floor. Visceral and surreal atmosphere. "
            "Wide establishing shot from slightly below, dramatic club lighting, 16:9 aspect ratio."
        ),
        "short": "Giant green zombie DJ with purple glasses in underground dungeon nightclub, zombie crowd, animated"
    },

    # 4. ENDICOTT ESTATE WIDE SHOT
    "endicott-estate-v5": {
        "detailed": (
            f"{STYLE}{SKY}"
            "Wide establishing shot of a large abandoned New England estate property from a slight aerial angle. "
            "A grand old mansion sits in the center of the property, dark windows, decaying facade, "
            "Victorian Gothic architecture with a peaked roof and columns, overgrown with dead vines. "
            "The grounds around the mansion have muted dark green grass, overgrown and patchy, "
            "with dead brown spots and blood stains scattered across the lawn. "
            "Several smaller buildings dot the property: a stone library, a gazebo, a greenhouse. "
            "A wrought-iron fence surrounds the entire property, rusted and bent in places. "
            "Large old willow trees with drooping branches cast dark shadows across the grounds. "
            "A winding road leads from the south gate up to the mansion entrance. "
            "Thick haze and fog hangs low over the grass, swirling between buildings. "
            "In the distance beyond the fence, a destroyed urban landscape is faintly visible through the haze. "
            "A few zombie silhouettes can be seen shambling across the grounds in the fog. "
            "The entire scene is bathed in the deep red light from the crimson sky above. "
            "Everything looks abandoned, haunted, and dangerous. "
            "Muted desaturated colors except for the red sky and faint green of the grass. "
            "Wide cinematic establishing shot, slight bird's eye angle, 16:9 aspect ratio."
        ),
        "short": "Abandoned haunted New England estate property wide shot, red sky, fog, zombies, animated cel-shaded"
    },

    # 5. TITLE SCREEN (creative, NO text)
    "title-screen-v5": {
        "detailed": (
            f"{STYLE}{SKY}"
            "A dramatic cinematic scene viewed from behind four silhouetted survivors standing at the edge "
            "of a hill or ridge, looking down at a vast destroyed cityscape below them. "
            "The four figures are seen from behind in dark silhouette: "
            "one tall and broad with a shotgun, one lean with a katana on his back, "
            "one average build with a sledgehammer resting on his shoulder, "
            "one slightly shorter with a gun at his side. "
            "They stand in a line looking out at what lies ahead. "
            "Below the ridge, a massive ruined city stretches to the horizon, "
            "buildings crumbling, fires burning in several locations casting orange light upward, "
            "thick smoke columns rising into the red sky. "
            "The streets below are flooded with hundreds of tiny zombie silhouettes, "
            "a sea of undead filling every road and alley visible from above. "
            "The scale is epic: four people against an entire city of the dead. "
            "The red sky dominates the upper half, dark brooding clouds, "
            "a faint sickly moon or sun barely visible through the haze. "
            "The mood is ominous but defiant, the survivors are not running, they are about to walk into it. "
            "Absolutely no text, no words, no titles, no UI elements anywhere. "
            "Epic wide cinematic composition, dramatic scale contrast, 16:9 aspect ratio."
        ),
        "short": "Four silhouetted survivors overlooking destroyed zombie-filled city from ridge, epic scale, animated"
    },

    # 6. ZOMBIE DOG PACK
    "zombie-dogs-v5": {
        "detailed": (
            f"{STYLE}{SKY}"
            "A pack of five terrifying mutant zombie dogs charging aggressively toward the viewer. "
            "The dogs are large, muscular, wolf-like creatures with dark brown-black matted fur. "
            "Their most distinctive feature: glowing teal-green crystalline spikes growing out of their backs "
            "and spines, jagged and sharp, emanating a faint sickly green glow. "
            "The spikes look organic but mineral, like corrupted crystal growths from infection. "
            "The dogs have exposed red muscle on parts of their bodies where fur has rotted away, "
            "blood dripping from their snarling jaws, rows of sharp yellowed fangs visible. "
            "Their eyes glow red with feral rage. "
            "The pack leader in the center is the largest, mid-leap with all four legs off the ground, "
            "jaws wide open, drool and blood flying from its mouth. "
            "Two dogs flank it on each side, running at full sprint, low to the ground, predatory. "
            "One dog in the back has its head tilted up in a howl. "
            "They charge down a foggy destroyed street, kicking up dust and debris. "
            "Blood stains and drag marks on the asphalt behind them from previous kills. "
            "Wrecked cars and crumbling buildings on the sides, dark and atmospheric. "
            "The pack moves as a unit, coordinated and deadly. "
            "Dynamic action shot from a low angle as they charge at the viewer, "
            "terrifying and fast, wide cinematic composition, 16:9 aspect ratio."
        ),
        "short": "Pack of mutant zombie dogs with glowing green crystal spikes charging at viewer, animated cel-shaded"
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
            "inputs": {"filename_prefix": f"rickarena_v5_{name}", "images": ["7", 0]}
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
            "inputs": {"filename_prefix": f"rickarena_v5_{name}_upscaled", "images": ["11", 0]}
        }
    }


def main():
    print("=" * 60)
    print("RickArena V5 — Scene Batch (6 images)")
    print("=" * 60)

    for name, prompt_data in PROMPTS.items():
        print(f"[QUEUE] {name}")
        workflow = build_workflow(name, prompt_data)
        prompt_id = queue_prompt(workflow)
        print(f"  -> {prompt_id}")
        time.sleep(0.5)

    print()
    print(f"All {len(PROMPTS)} queued. Check output for 'rickarena_v5_*' files.")


if __name__ == "__main__":
    main()
