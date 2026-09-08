window.onload = async () => {
    await document.fonts.load('25px "Cabin Sketch"');

    const app = new PIXI.Application();
    await app.init({
        width: window.innerWidth,
        height: window.innerHeight,
        backgroundColor: 0xeeeeee,
        resizeTo: window
    });
    document.body.appendChild(app.canvas);

    const imgStdNotes = await PIXI.Assets.load("assets/image/notes_std.png");
    const imgStdPencils = await PIXI.Assets.load("assets/image/pencils_std.png");

    const NOTE_W = 80;
    const NOTE_H = 25;
    const LANE_W = 80;

    const BASE_WIDTH = 1000;
    let baseHeight = 0;
    const gameContainer = new PIXI.Container();
    app.stage.addChild(gameContainer);

    let pressedStages = {};
    let inputDelayTimer = null;
    const INPUT_DELAY_MS = 40;

    const JUDGE_OFFSET = 0.000;

    let inputTimestamp = 0;

    const JUDGE_WIDTH = {
        PERFECT: 50,
        GOOD: 100,
        MISS: 150
    }

    const KEY_MAP = {
        "KeyD": 3, "KeyF": 2, "KeyJ": 2, "KeyK": 1
    }

    const NOTE_TEXTURE_X = 100;
    const NOTE_TEXTURE_Y = 25;

    const noteTextures = {
        type1: getNoteTexture(0, 0),
        type2: getNoteTexture(0, 1),
        type3: getNoteTexture(0, 2),
        type4: getNoteTexture(1, 0),
        type5: getNoteTexture(1, 1),
        type6: getNoteTexture(1, 2)
    }

    function getNoteTexture(col, row) {
        let rect;
        if (col === 0) {
            rect = new PIXI.Rectangle(col * NOTE_TEXTURE_X, row * NOTE_TEXTURE_Y, NOTE_TEXTURE_X, NOTE_TEXTURE_Y);
        } else if (row === 0 || row === 1) {
            rect = new PIXI.Rectangle(col * NOTE_TEXTURE_X, row * NOTE_TEXTURE_Y, NOTE_TEXTURE_X * 2, NOTE_TEXTURE_Y);
        } else {
            rect = new PIXI.Rectangle(col * NOTE_TEXTURE_X, row * NOTE_TEXTURE_Y, NOTE_TEXTURE_X * 3, NOTE_TEXTURE_Y);
        }
        
        return new PIXI.Texture({
            source: imgStdNotes.source,
            frame: rect
        });
    }

    const PENCIL_TEXTURE_X = 100;
    const PENCIL_TEXTURE_Y = 100;

    const pencilTextures = {
        normal: [getPencilTexture(0, 0), getPencilTexture(1, 0), getPencilTexture(2, 0)],
        mix: [getPencilTexture(0, 1), getPencilTexture(1, 1), getPencilTexture(2, 1)],
        black: getPencilTexture(0, 2)
    }

    function getPencilTexture(col, row) {
        const rect = new PIXI.Rectangle(col * PENCIL_TEXTURE_X, row * PENCIL_TEXTURE_Y, PENCIL_TEXTURE_X, PENCIL_TEXTURE_Y);
        return new PIXI.Texture({
            source: imgStdPencils.source,
            frame: rect
        }); 
    }

    const lane = new PIXI.Graphics();
    gameContainer.addChild(lane);

    const judgeFrame = new PIXI.Graphics();
    gameContainer.addChild(judgeFrame);

    const judgeText = new PIXI.Text({
        text: "",
        style: {
            fontFamily: "Cabin Sketch",
            fontSize: 25,
            fill: 0xffffff,
            align: "center"
        }
    });
    judgeText.anchor.set(0.5);
    gameContainer.addChild(judgeText);

    const grdPerfect = new PIXI.FillGradient({
        type: "linear",
        start: { x: 0, y: 0 },
        end: { x: 1, y: 0 },
        colorStops: [
            { offset: 0, color: "#ffbbcc" },
            { offset: 0.5, color: "#ffffbb" },
            { offset: 1, color: "#bbccff" }
        ]
    });

    const grdGood = new PIXI.FillGradient({
        type: "linear",
        start: { x: 0, y: 0 },
        end: { x: 0, y: 1},
        colorStops: [
            { offset: 0, color: "#ffeeaa" },
            { offset: 0.3, color: "#ffeeaa" },
            { offset: 1, color: "#ffaaff" }
        ]
    });

    const grdMiss = new PIXI.FillGradient({
        type: "linear",
        start: { x: 0, y: 0 },
        end: { x: 0, y: 1 },
        colorStops: [
            { offset: 0, color: "#ddaadd" },
            { offset: 1, color: "#6666cc" }
        ]
    });

    const pencils = [];
    const pencilRecoverSpeed = 1.5;
    const pencilContainer = new PIXI.Container();
    gameContainer.addChild(pencilContainer);
    for (let i = 0; i < 3; i++) {
        const pencil = new PIXI.Sprite(pencilTextures.normal[i]);
        pencil.anchor.set(0.5, 0);
        pencil.width = LANE_W;

        pencil.baseY = 0;
        pencil.offsetY = 0;

        pencilContainer.addChild(pencil);
        pencils.push(pencil);
    }

    const activeNotes = [];
    const notePool = [];

    let totalNotesCount = 0;
    let perfectCount = 0;
    let goodCount = 0;
    let missCount = 0;
    const accuracyText = new PIXI.Text({
        text: "0.00%",
        style: {
            fontFamily: "Cabin sketch",
            fontSize: 45,
            fill: "#000000",
            align: "right"
        }
    });
    accuracyText.anchor.set(1, 0);
    gameContainer.addChild(accuracyText);

    let judgeLine = 0;
    let leftLaneX = 0;
    let centerLaneX = 0;
    let rightLaneX = 0;

    function SetupPosition() {
        let screenWidth = app.screen.width;
        let screenHeight = app.screen.height;

        const scalelate = screenWidth / BASE_WIDTH;
        gameContainer.scale.set(scalelate);

        baseHeight = screenHeight / scalelate;

        // レーン全体の左端
        const startX = BASE_WIDTH / 2 - LANE_W * 1.5;

        leftLaneX = startX + LANE_W / 2;
        centerLaneX = startX + LANE_W + LANE_W / 2;
        rightLaneX = startX + LANE_W + LANE_W + LANE_W / 2;

        lane.clear()
            .rect(startX, 0, LANE_W, baseHeight)
            .rect(startX + LANE_W, 0, LANE_W, baseHeight)
            .rect(startX + LANE_W + LANE_W, 0, LANE_W, baseHeight)
            .fill(0x333333)
            .moveTo(startX + LANE_W, 0)
            .lineTo(startX + LANE_W, baseHeight)
            .moveTo(startX + LANE_W * 2, 0)
            .lineTo(startX + LANE_W * 2, baseHeight)
            .stroke({
                color: 0x666666,
                width: 2
            });
        judgeLine = baseHeight - 80;

        judgeFrame.clear()
            .rect(startX, judgeLine - NOTE_H / 2, NOTE_W, NOTE_H)
            .rect(startX + LANE_W, judgeLine - NOTE_H / 2, NOTE_W, NOTE_H)
            .rect(startX + LANE_W + LANE_W, judgeLine - NOTE_H / 2, NOTE_W, NOTE_H)
            .stroke({
                color: 0xffffff,
                width: 3
            });

        judgeText.x = BASE_WIDTH / 2;
        judgeText.y = judgeLine - 50;

        const pencilStartY = judgeLine + 30;

        pencils[0].x = rightLaneX;
        pencils[1].x = centerLaneX;
        pencils[2].x = leftLaneX;

        for (let i = 0; i < pencils.length; i++) {
            const pencil = pencils[i];
            pencil.baseY = pencilStartY;
            pencil.y = pencil.baseY + pencil.offsetY;
        }

        for (let note of activeNotes) {
            note.x = getNotePosition(note.type);
        }

        accuracyText.x = BASE_WIDTH - 100;
        accuracyText.y = 100;
    }

    function getNotePosition(type) {
        if (type === 1) {
            return rightLaneX;
        } else if (type === 2) {
            return centerLaneX;
        } else if (type === 3) {
            return leftLaneX;
        } else if (type === 4) {
            return centerLaneX + NOTE_W / 2;
        } else if (type === 5) {
            return leftLaneX + NOTE_W / 2;
        } else if (type === 6) {
            return centerLaneX;
        }
    }

    SetupPosition();
    window.addEventListener("resize", () => {
        SetupPosition();
    });

    const audioCtx = new window.AudioContext();
    let audioBuffer = null;
    let audioStartTime = 0;

    // SEを波形で保存する
    const seBuffers = {
        1: null,
        2: null,
        3: null
    }

    let isPlaying = false;
    let parsedNotes = [];
    const scrollSpeed = 300;
    const approachTime = 2.0;

    async function loadSE() {
        const sePaths = {
            1: "assets/sound/wood_high.wav",
            2: "assets/sound/wood_mid.wav",
            3: "assets/sound/wood_low.wav"
        };

        for (const stage in sePaths) {
            const res = await fetch(sePaths[stage]);
            const arrayBuffer = await res.arrayBuffer();
            seBuffers[stage] = await audioCtx.decodeAudioData(arrayBuffer);
        }
    }

    async function playSE(stage) {
        let seIndex = stage;
        const source = audioCtx.createBufferSource();
        source.buffer = seBuffers[seIndex];
        source.connect(audioCtx.destination);
        source.start();
    }

    async function loadStage(jsonPath) {
        const response = await fetch(jsonPath);
        const chartData = await response.json();
        const audioRes = await fetch(chartData.audioPath);
        const arrayBuffer = await audioRes.arrayBuffer();
        audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

        let currentBPM = chartData.bpm;
        let currentBeat = chartData.beat;
        const offset = chartData.offset || 0;
        let totalTime = 0;

        for (let line of chartData.lines) {
            line = line.trim();
            if (!line) continue;

            if (line.startsWith("bpm:")) {
                currentBPM = parseFloat(line.split(":")[1]);
                continue;
            }
            if (line.startsWith("beat:")) {
                currentBeat = parseInt(line.split(":")[1]);
                continue;
            }

            const chars = line.split("");
            const totalNotesInMeasure = chars.length;
            const measureDuration = (60 / currentBPM) * currentBeat;
            const timePerChar = measureDuration / totalNotesInMeasure;

            chars.forEach((char, index) => {
                const noteType = parseInt(char);
                if (noteType >= 1 && noteType <= 6) {
                    parsedNotes.push({
                        type: noteType,
                        time: totalTime + (index * timePerChar) + offset,
                        spawned: false
                    });
                }
            });
            totalTime += measureDuration;
        }

        totalNotesCount = parsedNotes.length;
        updateAccuracy();
        await loadSE();
    }

    async function startGame() {
        if (!audioBuffer) return;

        if (audioCtx.state === "suspended") {
            await audioCtx.resume();
        }

        const source = audioCtx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioCtx.destination);

        const startTime = audioCtx.currentTime + 2;

        source.start(startTime);
        audioStartTime = startTime;
        isPlaying = true;

        window.addEventListener("keydown", (e) => {
            const stage = KEY_MAP[e.code];
            if (e.repeat) return;

            if (isPlaying) {
                playSE(stage);
            }

            pressedStages[stage] = true;

            if (!inputDelayTimer) {
                inputTimestamp = audioCtx.currentTime;

                inputDelayTimer = setTimeout(() => {
                    const noteType = getNoteType(pressedStages);

                    if (noteType === -1) {
                        pencilAnimation([1, 2, 3], -1, true);
                    } else if (noteType > 0) {
                        judgeInput(noteType, inputTimestamp);

                        if (noteType === 1) { pencilAnimation([1], -1, false) }
                        else if (noteType === 2) { pencilAnimation([2], -1, false) }
                        else if (noteType === 3) { pencilAnimation([3], -1, false) }
                        else if (noteType === 4) { pencilAnimation([1, 2], 0, false) }
                        else if (noteType === 5) { pencilAnimation([2, 3], 1, false) }
                        else if (noteType === 6) { pencilAnimation([3, 1], 2, false) }
                    }

                    pressedStages = {};
                    inputDelayTimer = null;
                }, INPUT_DELAY_MS);
            }
        });
    }

    function getNoteType(stages) {
        if (stages[1] && stages[2] && stages[3]) return -1;

        if (stages[1] && stages[2]) return 4;
        if (stages[2] && stages[3]) return 5;
        if (stages[3] && stages[1]) return 6;

        if (stages[1]) return 1;
        if (stages[2]) return 2;
        if (stages[3]) return 3;

        return 0;
    }

    function judgeInput(type, pressedTime) {
        const currentTime = pressedTime - audioStartTime - JUDGE_OFFSET;
        let targetNote = null;
        let minDiff = Infinity;
        let targetIndex = -1;

        for (let i = 0; i < activeNotes.length; i++) {
            const note = activeNotes[i];
            if (note.texture === noteTextures[`type${type}`]) {
                const diff = currentTime - note.targetTime;
                if (Math.abs(diff) < minDiff && Math.abs(diff * 1000) <= JUDGE_WIDTH.MISS) {
                    minDiff = Math.abs(diff);
                    targetNote = note;
                    targetIndex = i;
                }
            }
        }

        if (targetNote) {
            executeJudgement(targetNote, targetIndex, minDiff * 1000);
        }
    }

    function executeJudgement(note, index, diffMs) {
        let judgement = "MISS";
        let color = "#ffffff";
        if (diffMs <= JUDGE_WIDTH.PERFECT) {
            judgement = "PERFECT";
            color = grdPerfect;
            perfectCount++;
        } else if (diffMs <= JUDGE_WIDTH.GOOD) {
            judgement = "GOOD";
            color = grdGood;
            goodCount++;
        } else if (diffMs <= JUDGE_WIDTH.MISS) {
            judgement = "MISS";
            color = grdMiss;
            missCount++;
        }

        showJudgement(judgement, color);
        updateAccuracy();

        activeNotes.splice(index, 1);
        note.visible = false;
        notePool.push(note);
    }

    function showJudgement(judgement, color) {
        judgeText.text = judgement;
        judgeText.alpha = 1.0;
        judgeText.style.fill = color;
    }

    function spawnNote(type) {
        let note;
        if (notePool.length > 0) {
            note = notePool.pop();
        } else {
            note = new PIXI.Sprite();
        }
        note.visible = true;
        note.anchor.set(0.5);
        note.texture = noteTextures[`type${type}`];
        note.type = type;

        if (type <= 3) {
            note.width = LANE_W;
        } else if (type <= 5) {
            note.width = LANE_W * 2;
        } else if (type === 6) {
            note.width = LANE_W * 3;
        }

        gameContainer.addChild(note);
        activeNotes.push(note);
        return note;
    }

    function pencilAnimation(stages, mixIndex, isBlack) {
        for (let i = 0; i < stages.length; i++) {
            const pencil = pencils[stages[i] - 1];
            if (isBlack) {
                pencil.texture = pencilTextures.black;
            } else if (mixIndex >= 0) {
                pencil.texture = pencilTextures.mix[mixIndex];
            } else {
                pencil.texture = pencilTextures.normal[stages[i] - 1];
            }

            pencil.offsetY = -20;
        }
    }

    function updateAccuracy() {
        if (totalNotesCount === 0) {
            accuracyText.text = "0.00%";
            return;
        }

        const currentScore = (perfectCount * 1.0) + (goodCount * 0.5);
        const accuracy = (currentScore / totalNotesCount) * 100;

        accuracyText.text = `${accuracy.toFixed(2)}%`;
    }

    app.ticker.add(() => {
        if (!isPlaying) return;

        const currentTime = audioCtx.currentTime - audioStartTime;

        for (let note of parsedNotes) {
            if (!note.spawned && note.time - currentTime <= approachTime) {
                const sprite = spawnNote(note.type);
                sprite.targetTime = note.time;
                note.spawned = true;
            }
        }

        for (let i = activeNotes.length - 1; i >= 0; i--) {
            const sprite = activeNotes[i];
            const timeLength = sprite.targetTime - currentTime;

            sprite.y = judgeLine - (timeLength * scrollSpeed);
            sprite.x = getNotePosition(sprite.type);

            if (currentTime - sprite.targetTime > JUDGE_WIDTH.MISS / 1000) {
                showJudgement("MISS", grdMiss);
                missCount++;
                updateAccuracy();
                activeNotes.splice(i, 1);
                sprite.visible = false;
                notePool.push(sprite);
            } else if (sprite.y > baseHeight + NOTE_H / 2) {
                activeNotes.splice(i, 1);
                sprite.visible = false;
                notePool.push(sprite);
            }

            if (judgeText.alpha > 0) {
                judgeText.alpha -= 0.02;
                if (judgeText.alpha < 0) {
                    judgeText.alpha = 0;
                }
            }
        }

        for (let i = 0; i < pencils.length; i++) {
            const pencil = pencils[i];
            if (pencil.offsetY < 0) {
                pencil.offsetY += pencilRecoverSpeed;
                if (pencil.offsetY > 0) {
                    pencil.offsetY = 0;
                    pencil.texture = pencilTextures.normal[i];
                }
            }
            pencil.y = pencil.baseY + pencil.offsetY;
            
        }
    });

    loadStage("assets/charts/01.json");

    window.addEventListener('click', startGame, { once: true });
};