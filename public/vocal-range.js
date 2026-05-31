(function () {
  var targetSampleRate = 11025;
  var minFrequency = 65.41;
  var maxFrequency = 1046.5;
  var windowSize = 2048;
  var hopSize = 1024;
  var analysisForm = document.getElementById("vocal-range-form");
  var fileInput = document.getElementById("audio-file");
  var preview = document.getElementById("audio-preview");
  var statusNode = document.getElementById("analysis-status");
  var resultsNode = document.getElementById("analysis-results");
  var detailsNode = document.getElementById("analysis-details");
  var analyzeButton = document.getElementById("analyze-button");
  var translateForm = document.getElementById("translate-chain-form");
  var translateInput = document.getElementById("translate-input");
  var translateSourceLanguage = document.getElementById("translate-source-language");
  var translateStatusNode = document.getElementById("translate-chain-status");
  var translateResultsNode = document.getElementById("translate-chain-results");
  var translateButton = document.getElementById("translate-chain-button");

  if (!analysisForm || !fileInput || !statusNode || !analyzeButton) {
    return;
  }

  fileInput.addEventListener("change", function () {
    var file = fileInput.files && fileInput.files[0];
    if (!file) {
      preview.hidden = true;
      preview.removeAttribute("src");
      statusNode.textContent = "Выберите файл и запустите анализ.";
      hideResults();
      return;
    }

    preview.src = URL.createObjectURL(file);
    preview.hidden = false;
    statusNode.textContent = "Файл готов. Нажмите кнопку, чтобы начать анализ.";
    hideResults();
  });

  analysisForm.addEventListener("submit", async function (event) {
    var file = fileInput.files && fileInput.files[0];

    event.preventDefault();

    if (!file) {
      setStatus("Сначала выберите аудиофайл.", true);
      return;
    }

    analyzeButton.disabled = true;
    hideResults();

    try {
      setStatus("Декодирую аудио и подготавливаю анализ...");
      var buffer = await decodeAudioFile(file);
      setStatus("Ищу устойчивые ноты по всей песне...");
      var summary = await analyzeAudioBuffer(buffer, function (message) {
        setStatus(message);
      });

      renderSummary(summary);
      setStatus("Анализ завершен.");
    } catch (error) {
      console.error(error);
      setStatus(error && error.message ? error.message : "Не удалось проанализировать аудио.", true);
      hideResults();
    } finally {
      analyzeButton.disabled = false;
    }
  });

  if (translateForm && translateInput && translateStatusNode && translateResultsNode && translateButton) {
    translateForm.addEventListener("submit", async function (event) {
      var text = String(translateInput.value || "").trim();
      var sourceLanguage = translateSourceLanguage ? translateSourceLanguage.value : "auto";

      event.preventDefault();

      if (!text) {
        setTranslateStatus("Введите текст для перевода.", true);
        hideTranslateResults();
        return;
      }

      translateButton.disabled = true;
      hideTranslateResults();

      try {
        setTranslateStatus("Запускаю цепочку перевода...");
        var response = await fetch("/api/vocal-range/translate-chain", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            text: text,
            sourceLanguage: sourceLanguage,
          }),
        });
        var payload = await response.json().catch(function () {
          return null;
        });

        if (!response.ok || !payload || !payload.ok) {
          throw new Error(payload && payload.error ? payload.error : "Не удалось выполнить перевод.");
        }

        renderTranslationChain(payload);
        setTranslateStatus("Перевод завершен.");
      } catch (error) {
        console.error(error);
        setTranslateStatus(error && error.message ? error.message : "Не удалось выполнить перевод.", true);
        hideTranslateResults();
      } finally {
        translateButton.disabled = false;
      }
    });
  }

  function setStatus(message, isError) {
    statusNode.textContent = message;
    statusNode.classList.toggle("notice-error", Boolean(isError));
  }

  function hideResults() {
    resultsNode.hidden = true;
    detailsNode.hidden = true;
  }

  function setTranslateStatus(message, isError) {
    translateStatusNode.textContent = message;
    translateStatusNode.classList.toggle("notice-error", Boolean(isError));
  }

  function hideTranslateResults() {
    translateResultsNode.hidden = true;
    translateResultsNode.innerHTML = "";
  }

  function renderTranslationChain(payload) {
    var stages = Array.isArray(payload.stages) ? payload.stages : [];

    translateResultsNode.innerHTML = stages.map(function (stage) {
      return [
        '<article class="mini-card vocal-range-translate-card">',
        '<span>' + escapeHtml(stage.label || "") + '</span>',
        '<strong>' + escapeHtml(String(stage.language || "").toUpperCase()) + '</strong>',
        '<p>' + escapeHtml(stage.text || "").replace(/\n/g, "<br />") + "</p>",
        "</article>",
      ].join("");
    }).join("");

    translateResultsNode.hidden = false;
  }

  async function decodeAudioFile(file) {
    var arrayBuffer = await file.arrayBuffer();
    var AudioContextClass = window.AudioContext || window.webkitAudioContext;

    if (!AudioContextClass) {
      throw new Error("Ваш браузер не поддерживает Web Audio API.");
    }

    var audioContext = new AudioContextClass();

    try {
      return await audioContext.decodeAudioData(arrayBuffer.slice(0));
    } finally {
      if (typeof audioContext.close === "function") {
        audioContext.close().catch(function () {});
      }
    }
  }

  async function analyzeAudioBuffer(audioBuffer, onProgress) {
    var mono = mixToMono(audioBuffer);
    var resampled = resampleMono(mono, audioBuffer.sampleRate, targetSampleRate);
    var pitches = [];
    var bpm;
    var totalFrames;
    var minLag = Math.max(2, Math.floor(targetSampleRate / maxFrequency));
    var maxLag = Math.max(minLag + 1, Math.floor(targetSampleRate / minFrequency));
    var index;

    if (resampled.length < windowSize) {
      throw new Error("Аудио слишком короткое для анализа.");
    }

    totalFrames = Math.max(1, Math.floor((resampled.length - windowSize) / hopSize) + 1);
    bpm = detectBpm(mono, audioBuffer.sampleRate);

    for (index = 0; index < totalFrames; index += 1) {
      var start = index * hopSize;
      var frame = resampled.subarray(start, start + windowSize);
      var frequency = detectPitch(frame, targetSampleRate, minLag, maxLag);

      if (frequency) {
        pitches.push(frequency);
      }

      if (index % 40 === 0) {
        onProgress("Идет анализ: " + Math.min(100, Math.round((index / totalFrames) * 100)) + "%");
        await nextFrame();
      }
    }

    return summarizePitches(pitches, bpm);
  }

  function mixToMono(audioBuffer) {
    var channelCount = audioBuffer.numberOfChannels;
    var mono = new Float32Array(audioBuffer.length);
    var channelIndex;
    var sampleIndex;

    for (channelIndex = 0; channelIndex < channelCount; channelIndex += 1) {
      var channelData = audioBuffer.getChannelData(channelIndex);
      for (sampleIndex = 0; sampleIndex < channelData.length; sampleIndex += 1) {
        mono[sampleIndex] += channelData[sampleIndex] / channelCount;
      }
    }

    return mono;
  }

  function resampleMono(input, sourceRate, targetRateValue) {
    var ratio = sourceRate / targetRateValue;
    var outputLength = Math.max(1, Math.floor(input.length / ratio));
    var output = new Float32Array(outputLength);
    var index;

    if (Math.abs(sourceRate - targetRateValue) < 1) {
      return input.slice();
    }

    for (index = 0; index < outputLength; index += 1) {
      var position = index * ratio;
      var leftIndex = Math.floor(position);
      var rightIndex = Math.min(input.length - 1, leftIndex + 1);
      var fraction = position - leftIndex;
      output[index] = input[leftIndex] * (1 - fraction) + input[rightIndex] * fraction;
    }

    return output;
  }

  function detectPitch(frame, sampleRate, minLag, maxLag) {
    var centered = new Float32Array(frame.length);
    var mean = 0;
    var rms = 0;
    var index;
    var lag;
    var bestCorrelation = 0;
    var bestLag = 0;

    for (index = 0; index < frame.length; index += 1) {
      mean += frame[index];
    }
    mean /= frame.length;

    for (index = 0; index < frame.length; index += 1) {
      centered[index] = frame[index] - mean;
      rms += centered[index] * centered[index];
    }

    rms = Math.sqrt(rms / frame.length);
    if (rms < 0.015) {
      return 0;
    }

    for (lag = minLag; lag <= maxLag; lag += 1) {
      var numerator = 0;
      var leftEnergy = 0;
      var rightEnergy = 0;

      for (index = 0; index < frame.length - lag; index += 1) {
        var leftSample = centered[index];
        var rightSample = centered[index + lag];
        numerator += leftSample * rightSample;
        leftEnergy += leftSample * leftSample;
        rightEnergy += rightSample * rightSample;
      }

      if (!leftEnergy || !rightEnergy) {
        continue;
      }

      var correlation = numerator / Math.sqrt(leftEnergy * rightEnergy);
      if (correlation > bestCorrelation) {
        bestCorrelation = correlation;
        bestLag = lag;
      }
    }

    if (bestCorrelation < 0.82 || !bestLag) {
      return 0;
    }

    return sampleRate / bestLag;
  }

  function summarizePitches(pitches, bpm) {
    var noteCounts = new Map();
    var midiValues;
    var stableMidis;
    var stablePitches;
    var minMidi;
    var maxMidi;
    var minPitch;
    var maxPitch;
    var threshold;

    if (!pitches.length) {
      throw new Error("Не удалось найти достаточно устойчивых нот. Попробуйте более чистую вокальную запись.");
    }

    midiValues = pitches
      .map(function (pitch) {
        return frequencyToMidi(pitch);
      })
      .filter(function (midi) {
        return Number.isFinite(midi);
      });

    midiValues.forEach(function (midi) {
      var rounded = Math.round(midi);
      noteCounts.set(rounded, (noteCounts.get(rounded) || 0) + 1);
    });

    threshold = Math.max(2, Math.ceil(midiValues.length * 0.01));
    stableMidis = Array.from(noteCounts.entries())
      .filter(function (entry) {
        return entry[1] >= threshold;
      })
      .map(function (entry) {
        return entry[0];
      })
      .sort(function (a, b) {
        return a - b;
      });

    if (!stableMidis.length) {
      stableMidis = Array.from(noteCounts.keys()).sort(function (a, b) {
        return a - b;
      });
    }

    stablePitches = pitches.filter(function (pitch) {
      var midi = Math.round(frequencyToMidi(pitch));
      return stableMidis.indexOf(midi) !== -1;
    });

    minMidi = stableMidis[0];
    maxMidi = stableMidis[stableMidis.length - 1];
    minPitch = stablePitches.reduce(function (currentMin, value) {
      return value < currentMin ? value : currentMin;
    }, stablePitches[0]);
    maxPitch = stablePitches.reduce(function (currentMax, value) {
      return value > currentMax ? value : currentMax;
    }, stablePitches[0]);

    return {
      lowestNote: formatMidiNote(minMidi),
      highestNote: formatMidiNote(maxMidi),
      lowestFrequency: minPitch,
      highestFrequency: maxPitch,
      rangeSemitones: maxMidi - minMidi,
      bpm: bpm,
    };
  }

  function renderSummary(summary) {
    var octaves = summary.rangeSemitones / 12;
    document.getElementById("lowest-note").textContent = summary.lowestNote;
    document.getElementById("highest-note").textContent = summary.highestNote;
    document.getElementById("song-range").textContent =
      octaves.toFixed(2) + " октавы";
    document.getElementById("lowest-frequency").textContent =
      summary.lowestNote + " • " + summary.lowestFrequency.toFixed(1) + " Hz";
    document.getElementById("highest-frequency").textContent =
      summary.highestNote + " • " + summary.highestFrequency.toFixed(1) + " Hz";
    document.getElementById("range-semitones").textContent =
      summary.rangeSemitones + " полутонов";
    document.getElementById("song-bpm").textContent =
      summary.bpm ? Math.round(summary.bpm) + " BPM" : "Не определен";

    resultsNode.hidden = false;
    detailsNode.hidden = false;
  }

  function detectBpm(samples, sampleRate) {
    var envelopeRate = 200;
    var envelope = buildAmplitudeEnvelope(samples, sampleRate, envelopeRate);
    var onsetEnvelope = buildOnsetEnvelope(envelope);
    var bestScore = 0;
    var bestLag = 0;
    var minBpm = 70;
    var maxBpm = 200;
    var minLag = Math.round((60 * envelopeRate) / maxBpm);
    var maxLag = Math.round((60 * envelopeRate) / minBpm);
    var lag;

    if (onsetEnvelope.length < maxLag * 2) {
      return 0;
    }

    for (lag = minLag; lag <= maxLag; lag += 1) {
      var score = autocorrelateEnvelope(onsetEnvelope, lag);
      if (score > bestScore) {
        bestScore = score;
        bestLag = lag;
      }
    }

    if (!bestLag || bestScore <= 0) {
      return 0;
    }

    return Math.round((60 * envelopeRate) / bestLag);
  }

  function buildAmplitudeEnvelope(samples, sampleRate, envelopeRate) {
    var samplesPerStep = Math.max(1, Math.round(sampleRate / envelopeRate));
    var envelopeLength = Math.max(1, Math.floor(samples.length / samplesPerStep));
    var envelope = new Float32Array(envelopeLength);
    var envelopeIndex;

    for (envelopeIndex = 0; envelopeIndex < envelopeLength; envelopeIndex += 1) {
      var start = envelopeIndex * samplesPerStep;
      var end = Math.min(samples.length, start + samplesPerStep);
      var energy = 0;
      var sampleIndex;

      for (sampleIndex = start; sampleIndex < end; sampleIndex += 1) {
        energy += Math.abs(samples[sampleIndex]);
      }

      envelope[envelopeIndex] = energy / Math.max(1, end - start);
    }

    return smoothEnvelope(envelope, 4);
  }

  function smoothEnvelope(values, radius) {
    var smoothed = new Float32Array(values.length);
    var index;

    for (index = 0; index < values.length; index += 1) {
      var start = Math.max(0, index - radius);
      var end = Math.min(values.length - 1, index + radius);
      var total = 0;
      var count = 0;
      var cursor;

      for (cursor = start; cursor <= end; cursor += 1) {
        total += values[cursor];
        count += 1;
      }

      smoothed[index] = total / Math.max(1, count);
    }

    return smoothed;
  }

  function buildOnsetEnvelope(envelope) {
    var onset = new Float32Array(envelope.length);
    var smoothed = smoothEnvelope(envelope, 6);
    var index;

    for (index = 1; index < smoothed.length; index += 1) {
      var delta = smoothed[index] - smoothed[index - 1];
      onset[index] = delta > 0 ? delta : 0;
    }

    return smoothEnvelope(onset, 3);
  }

  function autocorrelateEnvelope(envelope, lag) {
    var length = envelope.length - lag;
    var leftEnergy = 0;
    var rightEnergy = 0;
    var numerator = 0;
    var index;

    for (index = 0; index < length; index += 1) {
      var left = envelope[index];
      var right = envelope[index + lag];
      numerator += left * right;
      leftEnergy += left * left;
      rightEnergy += right * right;
    }

    if (!leftEnergy || !rightEnergy) {
      return 0;
    }

    return numerator / Math.sqrt(leftEnergy * rightEnergy);
  }

  function frequencyToMidi(frequency) {
    return 69 + 12 * Math.log2(frequency / 440);
  }

  function formatMidiNote(midi) {
    var names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    var normalized = Number(midi);
    var octave = Math.floor(normalized / 12) - 1;
    var name = names[((normalized % 12) + 12) % 12];
    return name + octave;
  }

  function nextFrame() {
    return new Promise(function (resolve) {
      window.setTimeout(resolve, 0);
    });
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
})();
