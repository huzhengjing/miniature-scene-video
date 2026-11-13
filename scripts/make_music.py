"""Original warm pentatonic score, music only."""
from pathlib import Path
from array import array
import math
import random
import wave
import json
import argparse

parser = argparse.ArgumentParser()
parser.add_argument('output', type=Path)
parser.add_argument('--duration', type=float, default=32)
args = parser.parse_args()
if not math.isfinite(args.duration) or args.duration <= 0:
    parser.error('duration must be positive and finite')
if args.output.exists():
    parser.error('output exists, obtain the user decision before another version')
args.output.parent.mkdir(parents=True, exist_ok=True)
RATE = 44100
SECONDS = args.duration
N = round(RATE * SECONDS)
rng = random.Random(9377)
left = array('f', [0.0]) * N
right = array('f', [0.0]) * N


def add(start, duration, sample, gain=1.0, pan=0.0):
    begin = round(start * RATE)
    frames = round(duration * RATE)
    l_gain = gain * math.sqrt((1-pan)/2)
    r_gain = gain * math.sqrt((1+pan)/2)
    for j in range(max(0,frames)):
        value = sample(j/RATE)
        left[(begin+j)%N] += value*l_gain
        right[(begin+j)%N] += value*r_gain


def hz(note):
    return 440 * 2 ** ((note-69)/12)


def piano(note, sustain):
    frequency = hz(note)
    def sample(t):
        attack = min(1, t/.008)
        envelope = attack*math.exp(-t/sustain)
        tone = math.sin(2*math.pi*frequency*t)
        tone += .24*math.sin(2*math.pi*frequency*2*t)*math.exp(-t*2)
        tone += .07*math.sin(2*math.pi*frequency*3*t)*math.exp(-t*4)
        return envelope*tone
    return sample


# Warm chord voicings, one every four seconds.
chords = [[50,57,62,66],[43,55,59,62],[47,54,59,62],[45,57,62,64]]
for bar in range(math.ceil(SECONDS / 4)):
    chord = chords[bar % len(chords)]
    for voice,note in enumerate(chord):
        add(bar*4+voice*.027,4.5,piano(note,1.5),.031,(voice-1.5)*.20)
    add(bar*4,3.5,piano(chord[0]-12,1.1),.038,0)

melody = [74,78,81,83,81,78,76,74,78,81,83,86,83,81,78,76]
for beat in range(math.ceil(SECONDS)):
    note = melody[beat % len(melody)]
    start = .08 + beat*1.0
    add(start,.95,piano(note,.32),.070,math.sin(beat*.7)*.2)
    add(start+.17,.8,piano(note,.29),.010,-math.sin(beat*.7)*.25)

# Normalize the cyclic score.
peak = max(max(abs(v) for v in left),max(abs(v) for v in right))
normalization = .75/max(peak,.001)
pcm = array('h')
energy = 0.0
for i,(l,r) in enumerate(zip(left,right)):
    t = i/RATE
    fade = 1.0
    l *= normalization*fade
    r *= normalization*fade
    energy += (l*l+r*r)/2
    pcm.append(round(max(-1,min(1,l))*32767))
    pcm.append(round(max(-1,min(1,r))*32767))
output = args.output
with wave.open(str(output),'wb') as audio:
    audio.setnchannels(2)
    audio.setsampwidth(2)
    audio.setframerate(RATE)
    audio.writeframes(pcm.tobytes())
report = {'duration':SECONDS,'sample_rate':RATE,'channels':2,'peak_before_normalization':peak,'rms':math.sqrt(energy/N),'content':'music only','effects':[]}
output.with_suffix('.audio.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print('Soundtrack complete, peak',round(peak,3),'RMS',round(report['rms'],3))

