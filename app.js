let QUIZ = null;

let state = {
    index: 0,
    answers: {},     // { [questionId]: { value: ..., timeSpentSec: ... } }
    score: 0,
    timer: null,
    timeLeft: 0,
    startedAtMs: 0
};

const $ = (id) => document.getElementById(id);

function show(screenId) {
    ["screen-home", "screen-quiz", "screen-results"].forEach(id => {
        $(id).classList.toggle("hidden", id !== screenId);
    });
}

async function loadQuiz() {
    const res = await fetch("questions.json", { cache: "no-store" });
    if (!res.ok) throw new Error("Impossible de charger questions.json");
    QUIZ = await res.json();
    $("quiz-title").textContent = QUIZ?.meta?.title ?? "Gamer Quiz";
}

function startQuiz() {
    state.index = 0;
    state.answers = {};
    state.score = 0;
    renderQuestion();
    show("screen-quiz");
}

function getCurrentQuestion() {
    return QUIZ.questions[state.index];
}

function clearTimer() {
    if (state.timer) {
        clearInterval(state.timer);
        state.timer = null;
    }
}

function startTimer(seconds) {
    clearTimer();
    state.timeLeft = seconds;
    state.startedAtMs = Date.now();
    $("time-left").textContent = String(state.timeLeft);

    state.timer = setInterval(() => {
        state.timeLeft -= 1;
        $("time-left").textContent = String(Math.max(0, state.timeLeft));

        if (state.timeLeft <= 0) {
            clearTimer();
            // auto-next (enregistre "no answer" si rien)
            if (!state.answers[getCurrentQuestion().id]) {
                state.answers[getCurrentQuestion().id] = { value: null, timeSpentSec: seconds };
            }
            goNext();
        }
    }, 1000);
}
function normalizeText(s) {
    if (s === null || s === undefined) return "";
    return String(s)
        .toLowerCase()
        .normalize("NFD")                 // sépare accents
        .replace(/[\u0300-\u036f]/g, "")  // supprime accents
        .replace(/[^a-z0-9\s]/g, " ")     // enlève ponctuation
        .replace(/\s+/g, " ")             // espaces multiples
        .trim();
}

function renderMedia(q) {
    const box = $("media");
    box.innerHTML = "";

    if (!q.media) {
        box.style.display = "none";
        return;
    }
    box.style.display = "block";

    const { type, src } = q.media;
    if (type === "image") {
        const img = document.createElement("img");
        img.src = src;
        img.alt = q.title ?? "image";
        box.appendChild(img);
    } else if (type === "video") {
        const v = document.createElement("video");
        v.src = src;
        v.controls = true;
        v.preload = "metadata";
        box.appendChild(v);
    } else if (type === "audio") {
        const a = document.createElement("audio");
        a.src = src;
        a.controls = true;
        a.preload = "metadata";
        box.appendChild(a);
    }
}

function setNextEnabled(enabled) {
    $("btn-next").disabled = !enabled;
}

function renderQuestion() {
    const q = getCurrentQuestion();
    $("progress").textContent = `Question ${state.index + 1} / ${QUIZ.questions.length}`;
    $("q-title").textContent = q.title ?? `Question ${state.index + 1}`;
    $("q-prompt").textContent = q.prompt ?? "";
    renderMedia(q);

    const oldForm = $("answer-form");
    const form = oldForm.cloneNode(false);
    oldForm.parentNode.replaceChild(form, oldForm);

    setNextEnabled(false);

    if (q.type === "mcq") {
        q.choices.forEach(c => {
            const row = document.createElement("label");
            row.className = "choice";
            row.innerHTML = `
        <input type="radio" name="mcq" value="${c.id}" />
        <span>${c.label}</span>
      `;
            form.appendChild(row);
        });
        form.addEventListener("change", onAnyAnswerChange, { once: true });

        form.addEventListener("change", () => setNextEnabled(true));
    }

    if (q.type === "multi") {
        q.choices.forEach(c => {
            const row = document.createElement("label");
            row.className = "choice";
            row.innerHTML = `
        <input type="checkbox" name="multi" value="${c.id}" />
        <span>${c.label}</span>
      `;
            form.appendChild(row);
        });
        form.addEventListener("change", () => {
            // active next only if at least one checked
            const any = [...form.querySelectorAll("input[type=checkbox]")].some(x => x.checked);
            setNextEnabled(any);
        });
    }

    if (q.type === "guess_number") {
        const min = q.range?.min ?? 0;
        const max = q.range?.max ?? 3000;
        const step = q.range?.step ?? 10;

        const wrap = document.createElement("div");
        wrap.className = "choice";
        wrap.style.flexDirection = "column";
        wrap.style.alignItems = "stretch";
        wrap.innerHTML = `
      <div style="display:flex; justify-content:space-between; gap:10px;">
        <span class="muted">Valeur</span>
        <strong id="guess-value">${min}</strong>
      </div>
      <input id="guess-slider" type="range" min="${min}" max="${max}" step="${step}" value="${min}" />
    `;
        form.appendChild(wrap);

        const slider = $("guess-slider");
        const out = $("guess-value");
        slider.addEventListener("input", () => {
            out.textContent = slider.value;
            setNextEnabled(true);
        });
    }

    if (q.type === "text") {
        const row = document.createElement("div");
        row.className = "choice";
        row.style.flexDirection = "column";
        row.style.alignItems = "stretch";
        row.innerHTML = `
      <label class="muted" style="margin-bottom:6px;">Ta réponse :</label>
      <input id="text-answer" type="text" placeholder="Écris ici..." style="padding:10px;border-radius:10px;border:1px solid var(--border);background:#0b1220;color:var(--text);" />
    `;
        form.appendChild(row);

        const input = $("text-answer");
        input.addEventListener("input", () => {
            // active next seulement si non vide
            setNextEnabled(normalizeText(input.value).length > 0);
        });
    }

    if (q.type === "rank") {
        (q.ranks ?? []).forEach((label, idx) => {
            const id = `r${idx}`;
            const row = document.createElement("label");
            row.className = "choice";
            row.innerHTML = `
        <input type="radio" name="rank" value="${label}" />
        <span>${label}</span>
      `;
            form.appendChild(row);
        });

        form.addEventListener("change", () => setNextEnabled(true));
    }

    const time = q.timeSec ?? QUIZ.meta?.defaultTimeSec ?? 60;
    startTimer(time);
}

function onAnyAnswerChange() {
    // placeholder if you want “first interaction” tracking later
}

function collectAnswer(q) {
    const form = $("answer-form");
    if (q.type === "mcq") {
        const checked = form.querySelector("input[type=radio]:checked");
        return checked ? checked.value : null;
    }
    if (q.type === "multi") {
        const checked = [...form.querySelectorAll("input[type=checkbox]:checked")].map(x => x.value);
        return checked.length ? checked : null;
    }
    if (q.type === "guess_number") {
        const slider = $("guess-slider");
        return slider ? Number(slider.value) : null;
    }
    if (q.type === "text") {
        const input = $("text-answer");
        return input ? input.value : null;
    }

    if (q.type === "rank") {
        const checked = form.querySelector("input[type=radio]:checked");
        return checked ? checked.value : null;
    }
    return null;
}

function arraysEqualAsSets(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    const sa = new Set(a), sb = new Set(b);
    if (sa.size !== sb.size) return false;
    for (const x of sa) if (!sb.has(x)) return false;
    return true;
}

function scoreQuestion(q, userValue) {
    // no answer => 0
    if (userValue === null) return { points: 0, correct: false };

    if (q.type === "mcq") {
        const correct = userValue === q.answer;
        return { points: correct ? (q.points ?? 1) : 0, correct };
    }

    if (q.type === "multi") {
        const correct = arraysEqualAsSets(userValue, q.answer);
        return { points: correct ? (q.points ?? 1) : 0, correct };
    }

    if (q.type === "guess_number") {
        const target = Number(q.answerNumber);
        const diff = Math.abs(Number(userValue) - target);
        const tol = q.tolerance ?? { perfect: 50, good: 150, ok: 300 };
        const pts = q.points ?? { perfect: 3, good: 2, ok: 1, miss: 0 };

        if (diff <= tol.perfect) return { points: pts.perfect, correct: true };
        if (diff <= tol.good) return { points: pts.good, correct: true };
        if (diff <= tol.ok) return { points: pts.ok, correct: true };
        return { points: pts.miss, correct: false };
    }
    if (q.type === "text") {
        const user = normalizeText(userValue);
        const accepted = (q.acceptedAnswers ?? []).map(normalizeText);
        const correct = user.length > 0 && accepted.includes(user);
        return { points: correct ? (q.points ?? 1) : 0, correct };
    }

    if (q.type === "rank") {
        const correct = userValue === q.answer;
        return { points: correct ? (q.points ?? 1) : 0, correct };
    }

    return { points: 0, correct: false };
}

function goNext() {
    const q = getCurrentQuestion();

    // If we came from manual "Next", we may need to record the answer
    if (!state.answers[q.id]) {
        const totalTime = q.timeSec ?? QUIZ.meta?.defaultTimeSec ?? 60;
        const spent = Math.min(totalTime, Math.max(0, Math.round((Date.now() - state.startedAtMs) / 1000)));
        state.answers[q.id] = { value: collectAnswer(q), timeSpentSec: spent };
    }

    state.index += 1;

    if (state.index >= QUIZ.questions.length) {
        finishQuiz();
    } else {
        renderQuestion();
    }
}

function finishQuiz() {
    clearTimer();

    // compute score + details
    let total = 0;
    let max = 0;

    const detail = $("results-detail");
    detail.innerHTML = "";

    QUIZ.questions.forEach((q, i) => {
        const a = state.answers[q.id] ?? { value: null, timeSpentSec: (q.timeSec ?? 60) };
        const s = scoreQuestion(q, a.value);

        total += s.points;
        // max points: try to infer
        if (q.type === "guess_number") {
            const pts = q.points ?? { perfect: 3 };
            max += pts.perfect ?? 3;
        } else {
            max += q.points ?? 1;
        }

        const row = document.createElement("div");
        row.className = "result-item";
        row.innerHTML = `
      <div style="display:flex; justify-content:space-between; gap:10px;">
        <strong>${i + 1}. ${q.title ?? q.id}</strong>
        <span class="${s.correct ? "good" : "bad"}">${s.correct ? "OK" : "KO"} (+${s.points})</span>
      </div>
      <div class="muted" style="margin-top:6px;">
        Ta réponse : <code>${formatAnswer(a.value)}</code>
        ${formatExpected(q)}
        • Temps : ${a.timeSpentSec}s
      </div>
    `;
        detail.appendChild(row);
    });

    state.score = total;
    $("score-line").textContent = `Score : ${total} / ${max}`;
    show("screen-results");
}

function formatAnswer(v) {
    if (v === null) return "— (pas de réponse)";
    if (Array.isArray(v)) return v.join(", ");
    return String(v);
}

function formatExpected(q) {
    if (q.type === "mcq") return ` • Attendu : <code>${q.answer}</code>`;
    if (q.type === "multi") return ` • Attendu : <code>${q.answer.join(", ")}</code>`;
    if (q.type === "guess_number") return ` • Attendu : <code>${q.answerNumber}</code>`;
    if (q.type === "text") return ` • Attendu : <code>${(q.acceptedAnswers ?? []).join(" | ")}</code>`;
    if (q.type === "rank") return ` • Attendu : <code>${q.answer}</code>`;
    return "";
}

// EVENTS
$("btn-start").addEventListener("click", () => startQuiz());
$("btn-next").addEventListener("click", (e) => {
    e.preventDefault();
    clearTimer();
    goNext();
});
$("btn-restart").addEventListener("click", () => {
    show("screen-home");
});

// INIT
(async function init() {
    try {
        await loadQuiz();
        show("screen-home");
    } catch (err) {
        document.body.innerHTML = `<pre style="color:white;padding:20px;">${err}\n\nVérifie que questions.json existe à la racine.</pre>`;
    }
})();