import sys, subprocess, soundfile as sf
from kokoro_onnx import Kokoro
models, out, final = sys.argv[1], sys.argv[2], sys.argv[3]
k = Kokoro(f'{models}/kokoro-v1.0.int8.onnx', f'{models}/voices-v1.0.bin')
LINES = {
  'enter': 'Entering Doorlink World.',
  'garage': 'More than just garage doors. Explore, customise and visualise the perfect door for your property.',
  'gate': 'From swing gates to sliding gates, we’ve got you covered.',
  'fence': 'And we don’t stop there.',
  'shutters': 'Explore roller shutters, fencing and more, all in one place.',
  'market': 'Doorlink connects customers with businesses and skilled tradespeople. Compare quotes and choose with confidence.',
  'features': 'Design it. Visualise it. Compare it. Connect.',
  'reveal': 'Welcome to a smarter way forward.',
  'logo': 'Doorlink. Your vision. Our connection.',
}
for name, text in LINES.items():
    samples, rate = k.create(text, voice='bf_emma', speed=1.0, lang='en-gb')
    wav = f'{out}/{name}.wav'
    sf.write(wav, samples, rate)
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-ac', '1', '-ar', '24000', '-b:a', '48k', f'{final}/{name}.mp3'], check=True)
    print(name, round(len(samples) / rate, 1), 's')
