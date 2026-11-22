# Speech Listening Study

A static pilot experiment that can be hosted with GitHub Pages. It presents a sentence mixed with one of two maskers at the SNR specified for that material, collects five keyword responses and a listening effort rating, scores exact keyword matches, and exports trial level CSV and JSON files.

## Add the study materials

Edit `materials.csv`. Keep the header row unchanged.

| Column | Content |
| --- | --- |
| `id` | Unique trial ID |
| `phase` | `practice`, `optional_practice`, or `main` |
| `sentence` | Sentence transcript |
| `keyword_1`–`keyword_5` | Five scoring keywords |
| `sentence_audio` | Relative path to the sentence WAV file |
| `ssn_audio` | Relative path to `SSN.wav` |
| `ssn_snr_db` | SNR for SSN trials (`3` for the first pilot) |
| `competing_speech_audio` | Relative path to `CompetingSpeech.wav` |
| `competing_speech_snr_db` | SNR for competing speech trials (`-5` for the first pilot) |
| `forced_masker` | Optional fixed practice condition: `SSN` or `CompetingSpeech`; leave blank for balanced random assignment |
| `source` | Sentence source or list citation |

Put sentence recordings in `audio/sentences/`. Put `SSN.wav` and `CompetingSpeech.wav` in `audio/maskers/`. All files should be mono, 48 kHz WAV. Both maskers should be 120 seconds long and normalized to -26 dBFS RMS.

The program assigns SSN and competing speech evenly across main trials, randomizes trial order, and mixes the signals in the browser at the condition-specific SNR. Each trial uses a different random excerpt from the corresponding 120-second masker. In SSN trials, the noise begins 0.5 seconds before the target and ends 0.5 seconds after it. In competing-speech trials, the male target begins first; the female competing speech enters 0.5 seconds later and ends 0.5 seconds after the target.

## Preview locally

Run a local server from this folder:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Publish on GitHub Pages

1. Create a public GitHub repository and upload all files while preserving the folders.
2. Open **Settings → Pages**.
3. Under **Build and deployment**, select **Deploy from a branch**.
4. Choose the `main` branch and `/ (root)`, then save.

GitHub Pages is a static host. Each participant must download the CSV at the end and send it to the researcher. Central automatic data storage requires a separate database or form endpoint.

## Output

The CSV contains participant ID, phase, order, trial ID, sentence, audio paths, assigned masker, SNR, expected and entered keywords, score, listening effort, response time, source, and timestamps.
