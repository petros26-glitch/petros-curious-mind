/* Offline story-description helper. No API key, network request, or external AI service. */
(function () {
  "use strict";

  const STOP = new Set(("a an the and or but if then than so as at by for from in into of on onto to with without is am are was were be been being it its this that these those he she they them their his her we you your i me my our who whom what when where why how not no do does did can could would should will shall may might must have has had having there here about after before over under again further once story stories").split(/\s+/));
  const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
  const words = (value) => (String(value).toLowerCase().match(/[a-z][a-z'-]{2,}/g) || []);

  function splitSentences(text) {
    const source = clean(text);
    if (!source) return [];
    const chunks = source.match(/[^.!?]+[.!?]+[”’"')\]]*|[^.!?]+$/g) || [source];
    return chunks.map(clean).filter((sentence) => words(sentence).length >= 4);
  }

  function sentenceScore(sentence, frequencies, index, total) {
    const tokens = words(sentence);
    const unique = new Set(tokens.filter((word) => !STOP.has(word)));
    let score = 0;
    unique.forEach((word) => { score += Math.min(frequencies[word] || 0, 5); });
    const length = tokens.length;
    if (length >= 8 && length <= 34) score += 5;
    else if (length > 50) score -= 5;
    if (/\b(because|but|when|until|although|while|however|before|after|despite|instead|finally|realized|discovered|learned|decided|promised|refused|returned|revealed)\b/i.test(sentence)) score += 3;
    if (/\b(he|she|they|it)\s+(was|were|is|are|had|has|have|felt|knew|wanted|found|saw|heard|said|asked|told|went|came)\b/i.test(sentence)) score += 1;
    if (/^[“"']/.test(sentence)) score += 1;
    if (/\b(chapter|copyright|all rights reserved|subscribe|follow us)\b/i.test(sentence)) score -= 12;
    const position = total <= 1 ? 0.5 : index / (total - 1);
    return score + (position < 0.18 || position > 0.82 ? 1.5 : 0);
  }

  function selectAnchors(sentences, scores, start, end, used) {
    const candidates = sentences.map((sentence, index) => ({ sentence, index, score: scores[index] }))
      .filter((item) => item.index >= start && item.index <= end && !used.has(item.index))
      .sort((a, b) => b.score - a.score);
    const chosen = candidates[0];
    if (chosen) used.add(chosen.index);
    return chosen ? chosen.sentence : "";
  }

  function generate(title, rawContent) {
    const text = clean(rawContent);
    const sentences = splitSentences(text);
    if (sentences.length < 2) {
      return { options: [], message: "Please add a little more story text so the generator can analyse its narrative." };
    }

    const frequencies = Object.create(null);
    words(text).forEach((word) => { if (!STOP.has(word)) frequencies[word] = (frequencies[word] || 0) + 1; });
    const scores = sentences.map((sentence, index) => sentenceScore(sentence, frequencies, index, sentences.length));
    const firstEnd = Math.max(0, Math.floor((sentences.length - 1) * 0.35));
    const middleStart = Math.floor(sentences.length * 0.25);
    const middleEnd = Math.max(middleStart, Math.floor(sentences.length * 0.75));
    const lastStart = Math.floor((sentences.length - 1) * 0.65);
    const used = new Set();
    const opening = selectAnchors(sentences, scores, 0, firstEnd, used);
    const middle = selectAnchors(sentences, scores, middleStart, middleEnd, used);
    const ending = selectAnchors(sentences, scores, lastStart, sentences.length - 1, used);
    const best = sentences.map((sentence, index) => ({ sentence, index, score: scores[index] }))
      .sort((a, b) => b.score - a.score).map((item) => item.sentence);
    const fallback = (count, excluded) => best.filter((sentence) => !excluded.includes(sentence)).slice(0, count);
    const anchors = [opening, middle, ending].filter(Boolean);
    const extra = fallback(3, anchors);
    const a = opening || extra[0] || best[0];
    const b = middle || extra[0] || best[1];
    const c = ending || extra[1] || best[2];
    const storyTitle = clean(title);
    const lead = storyTitle ? storyTitle + " — " : "";
    const make = (intro, parts) => {
      const uniqueParts = [];
      parts.forEach((part) => { if (part && !uniqueParts.includes(part)) uniqueParts.push(part); });
      let result = lead + intro + " " + uniqueParts.join(" ");
      if (result.length > 500) {
        result = lead + intro + " " + uniqueParts.slice(0, 2).join(" ");
      }
      return result.length > 500 ? result.slice(0, 497).replace(/\s+\S*$/, "") + "…" : result;
    };

    const options = [
      make("At the centre of this story:", [a, b]),
      make("The story's key moments emerge through these events:", [b, c]),
      make("From its opening to its later developments:", [a, c])
    ].filter((value, index, list) => list.indexOf(value) === index);

    return {
      options,
      message: "Built from the full story text. The generator prioritises recurring story details and important sentences from different parts of the narrative. Review each option before saving."
    };
  }

  window.PCMStoryDescriptionGenerator = { generate };
})();