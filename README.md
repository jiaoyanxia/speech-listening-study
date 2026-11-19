# Speech Listening Study

A static pilot experiment that can be hosted with GitHub Pages. It presents a sentence mixed with one of two maskers at the SNR specified for that material, collects five keyword responses and a listening effort rating, scores exact keyword matches, and exports trial level CSV and JSON files.

## Add the study materials

Edit `materials.csv`. Keep the header row unchanged.

| Column | Content |
| --- | --- |
| `id` | Unique trial ID |
| `phase` | `practice` or `main` |
| `sentence` | Sentence transcript |
| `keyword_1`–`keyword_5` | Five scoring keywords |
| `sentence_audio` | Relative path to the sentence WAV file |
| `masker_a` | Relative path to the first masker WAV file |
| `masker_b` | Relative path to the second masker WAV file |
| `pilot_snr_db` | Pilot SNR in dB, such as `0`, `-3`, or `-6` |
| `source` | Sentence source or list citation |

Put sentence recordings in `audio/sentences/`. Put the two masker recordings in `audio/maskers/`. WAV files are recommended. Replace every placeholder row before data collection.

The program assigns masker A and masker B as evenly as possible within each phase, randomizes trial order, calculates the masker gain from the RMS of both audio files, and mixes them in the browser at the SNR in the table.

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
