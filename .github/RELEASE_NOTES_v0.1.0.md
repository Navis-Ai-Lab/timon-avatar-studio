First public release of **Timon Avatar Studio**: generate avatars for your agents from a text prompt, locally on the CPU, and apply them in one click.

- An **Avatars** page: a prompt or a preset gives a 512×512 image in ~5 s on a desktop CPU (20–60 s on a small server)
- Presets made for agent avatars (Timon-style meerkats, mission commander, coder, reviewer, planner, tester…, 80s cartoon, chibi, 3D, pixel art), editable in the plugin settings
- A seed per image for variations of the same character; a gallery per account with the prompt on hover
- **Set as avatar** on any image, and **Generate an avatar** in each agent's menu
- CPU threads setting (all cores but one by default), English and French
- Runs MiniT2I (MIT) with onnxruntime-node inside the daemon: no GPU, no API key; prompts and images stay on your machine. MIT licensed.

**Install** (the plugin is unsigned, so turn on *Settings › Plugins › Developer mode* first):

```
timon plugin add ./timon-avatar-studio-0.1.0.tgz
```

or from the repository: `git clone` it, then `timon plugin add .`. Requires plugin API 15 or later. Open **Avatars**, then click **Download the model** (313 MB, once; allow `huggingface.co` and `*.hf.co` for the plugin) or copy the three model files by hand (see the README).

Known limits: about 1.5 GB of RAM while the model is loaded (unloaded after 10 idle minutes); images are 512×512; good at cartoon and illustration, weaker at photorealistic faces, and no legible text.
