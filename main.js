window.onload = async () => {
    // ========================================
    // アプリケーション初期化・フォント読み込み
    // ========================================
    await document.fonts.load('25px "Cabin Sketch"');

    const app = new PIXI.Application();
    await app.init({
        width: window.innerWidth,
        height: window.innerHeight,
        backgroundColor: 0xeeeeee,
        resizeTo: window
    });
    
    const gameScreen = document.getElementById("game-screen");
    gameScreen.appendChild(app.canvas);

    // ========================================
    // ゲームの設定値・定数 
    // ========================================

    // --- 画像データ読み込み ---
    const imgStdNotes = await PIXI.Assets.load("assets/image/notes_std.png");
    const imgStdPencils = await PIXI.Assets.load("assets/image/pencils_std.png");
    const imgParticles = await PIXI.Assets.load("assets/image/particles.png");

    imgStdPencils.source.scaleMode = "nearest";
    imgStdNotes.source.scaleMode = "nearest";

    // --- ノーツと縮尺の基本設定
    const NOTE_W = 80;
    const NOTE_H = 25;
    const LANE_W = 80;

    const BASE_WIDTH = 1000;
    let baseHeight = 0;

    const gameContainer = new PIXI.Container();
    app.stage.addChild(gameContainer);

    // --- 入力・判定 ---
    let pressedStages = {};
    let inputDelayTimer = null;
    const INPUT_DELAY_MS = 50;  // これ以下の間隔で押されたキーは同時押し
    const JUDGE_OFFSET = 0.000;
    
    const JUDGE_WIDTH = {
        PERFECT: 50,
        GOOD: 100,
        MISS: 150
    }

    let currentKeyMap = {};

    // --- ノーツのテクスチャ ---
    const NOTE_TEXTURE_X = 100;
    const NOTE_TEXTURE_Y = 25;
    const noteTextures = {
        type1: getNoteTexture(0, 0, 1),
        type2: getNoteTexture(0, 1, 1),
        type3: getNoteTexture(0, 2, 1),
        type4: getNoteTexture(1, 0, 2),
        type5: getNoteTexture(1, 1, 2),
        type6: getNoteTexture(1, 2, 2),
        type4_3: getNoteTexture(3, 0, 3),
        type5_3: getNoteTexture(3, 1, 3),
        type6_3: getNoteTexture(3, 2, 3)
    }

    function getNoteTexture(col, row, lane) {
        const rect = new PIXI.Rectangle(
            col * NOTE_TEXTURE_X,
            row * NOTE_TEXTURE_Y,
            NOTE_TEXTURE_X * lane,
            NOTE_TEXTURE_Y
        );

        return new PIXI.Texture({
            source: imgStdNotes.source,
            frame: rect
        });
    }

    // --- 鉛筆のテクスチャ ---
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

    // --- 画面のオブジェクト ---
    let currentDiff;
    let laneCount = 3;
    let laneXList = [];

    let inputTimestamp = 0;  

    const lane = new PIXI.Graphics();
    gameContainer.addChild(lane);

    let laneColors = [];
    let mixLaneColors = [];
    let currentLaneColors = [];

    const judgeFrame = new PIXI.Graphics();
    gameContainer.addChild(judgeFrame);

    let frameColors = [];

    const judgeText = new PIXI.Text({
        text: "",
        style: {
            fontFamily: "Cabin Sketch",
            fontSize: 25,
            fill: "#ffffff",
            align: "center"
        }
    });
    judgeText.anchor.set(0.5);
    gameContainer.addChild(judgeText);

    let isShowDiff = false;
    const diffText = new PIXI.Text({
        text: "",
        style: {
            fontFamily: "Cabin Sketch",
            fontSize: 20,
            fill: "#ffffff",
            align: "center"
        }
    });
    diffText.anchor.set(0.5);
    gameContainer.addChild(diffText);

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

    // ***** 完成までに削除する *********************************************
    const textKari = new PIXI.Text({
        text: "",
        style: {
            fontFamily: "monospace",
            fontSize: 20,
            fill: "#000000",
            align: "left"
        }
    });
    gameContainer.addChild(textKari);
    // ***** 完成までに削除する *********************************************

    let judgeLine = 0;

    const noteColors = {};

    let particleTextures;

    const particleContainer = new PIXI.Container();
    gameContainer.addChild(particleContainer);

    const activeParticles = [];

    // ========================================
    // 描画・座標計算関数
    // ========================================
    function initParticleTexture(app, imgParticles) {
        for (const key in noteTextures) {
            const frame = noteTextures[key].frame;
            const canvas = document.createElement("canvas");
            canvas.width = frame.width;
            canvas.height = frame.height;
            const ctx = canvas.getContext("2d");

            const sourceImage = noteTextures[key].source.resource;
            ctx.drawImage(
                sourceImage,
                frame.x, frame.y, frame.width, frame.height,
                0, 0, frame.width, frame.height
            );

            const pixel = ctx.getImageData(Math.floor(frame.width / 5), Math.floor(frame.height / 2), 1, 1).data;
            noteColors[key] = (pixel[0] << 16) | (pixel[1] << 8) | pixel[2];
        }

        const rect = new PIXI.Graphics().rect(0, 0, 5, 7).fill(0xffffff);
        const triangle = new PIXI.Graphics().poly([0, 9, 4, 0, 8, 5]).fill(0xffffff);
        const chipRect = app.renderer.generateTexture(rect);
        const chipTri = app.renderer.generateTexture(triangle);
        rect.destroy();
        triangle.destroy();

        particleTextures = {
            shaving: {
                wood: [
                    new PIXI.Texture({ source: imgParticles.source, frame: new PIXI.Rectangle(0, 0, 50, 50) }),
                    new PIXI.Texture({ source: imgParticles.source, frame: new PIXI.Rectangle(50, 0, 50, 50) })
                ],
                core: [
                    new PIXI.Texture({ source: imgParticles.source, frame: new PIXI.Rectangle(0, 50, 50, 50) }),
                    new PIXI.Texture({ source: imgParticles.source, frame: new PIXI.Rectangle(50, 50, 50, 50) })
                ]
            },

            chip: [
                chipRect,
                chipTri
            ]
        }
    }

    function drawLaneColors() {
        lane.clear();

        const totalLaneWidth = LANE_W * laneCount;
        const startX = BASE_WIDTH / 2 - totalLaneWidth / 2;

        for (let i = 0; i < laneCount; i++) {
            const x = startX + LANE_W * i;
            const color = currentLaneColors[i];

            lane.rect(
                x,
                0,
                LANE_W,
                baseHeight
            ).fill(color);

            lane.rect(
                x,
                0,
                LANE_W,
                baseHeight
            ).fill({
                color: 0x111111,
                alpha: 0.8
            });

            for (let i = 1; i < laneCount; i++) {
                lane.moveTo(startX + LANE_W * i, 0)
                    .lineTo(startX + LANE_W * i, baseHeight)
                    .stroke({
                        color: 0x666666,
                        width: 2
                    });
            }
        }
    }

    // 画面サイズに合わせてゲームのスケーリングを行う
    function SetupPosition() {
        let screenWidth = app.screen.width;
        let screenHeight = app.screen.height;

        const scalelate = screenWidth / BASE_WIDTH;
        gameContainer.scale.set(scalelate);

        baseHeight = screenHeight / scalelate;

        const totalLaneWidth = LANE_W * laneCount;

        // レーン全体の左端
        const startX = BASE_WIDTH / 2 - totalLaneWidth / 2;

        laneXList = [];
        for (let i = 0; i < laneCount; i++) {
            laneXList.push(startX + LANE_W * i + LANE_W / 2)
        }

        drawLaneColors();

        judgeLine = baseHeight - 80;

        judgeFrame.clear();
        for (let i = 0; i < laneCount; i++) {
            judgeFrame.rect(
                startX + LANE_W * i,
                judgeLine - NOTE_H / 2,
                NOTE_W,
                NOTE_H
            ).stroke({
                color: frameColors[i],
                width: 2
            });
        }

        judgeText.x = BASE_WIDTH / 2;
        judgeText.y = judgeLine - 50;

        diffText.x = BASE_WIDTH / 2;
        diffText.y = judgeLine - 25;

        const pencilStartY = judgeLine + 30;
        for (let i = 0; i < pencils.length; i++) {
            if (i < laneCount) {
                pencils[i].visible = true;
                pencils[i].x = laneXList[i];
                pencils[i].baseY = pencilStartY;
                pencils[i].y = pencils[i].baseY + pencils[i].offsetY;

                // レーンに応じた色の初期化
                if (laneCount === 2) {
                    pencils[i].defaultColorIndex = (i === 0) ? 2 : 1;
                } else {
                    pencils[i].defaultColorIndex = (i === 0) ? 2 : (i === 1) ? 1 : 0;
                }
                pencils[i].texture = pencilTextures.normal[pencils[i].defaultColorIndex];
            } else {
                pencils[i].visible = false;
            }
        }

        for (let note of activeNotes) {
            note.x = getNotePosition(note.type);
        }

        accuracyText.x = BASE_WIDTH - 100;
        accuracyText.y = 100;

        // *****
        textKari.x = 20;
        textKari.y = 100;
        // *****
    }

    // 各ノーツに応じたX座標を渡す
    function getNotePosition(type) {
        if (laneCount === 2) {
            if (type === 2) {
                return laneXList[1];
            } else if (type === 3) {
                return laneXList[0];
            } else if (type === 5) {
                return (laneXList[0] + laneXList[1]) / 2;
            }
        } else {
            if (type === 1) {
                return laneXList[2];
            } else if (type === 2) {
                return laneXList[1];
            } else if (type === 3) {
                return laneXList[0];
            } else if (type >= 4 && type <= 6) {
                return laneXList[1];
            }
        }
        return laneXList[0];
    }

    initParticleTexture(app, imgParticles);

    laneColors = [
        noteColors.type3,
        noteColors.type2,
        noteColors.type1
    ];

    frameColors = [...laneColors];

    mixLaneColors = [
        noteColors.type4,
        noteColors.type5,
        noteColors.type6
    ]

    currentLaneColors = [...laneColors];

    SetupPosition();
    window.addEventListener("resize", () => {
        SetupPosition();
    });

    // ========================================
    // SEの処理
    // ========================================
    const audioCtx = new window.AudioContext();
    let audioBuffer = null;
    let audioStartTime = 0;

    const seBuffers = {
        1: null,
        2: null,
        3: null
    }

    let isPlaying = false;
    let parsedNotes = [];

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

    // ========================================
    // 譜面の処理
    // ========================================
    const scrollSpeed = 300;
    const approachTime = 2.0;

    async function loadStage(jsonPath, diffKey) {
        // リセット
        parsedNotes = [];
        activeNotes.length = 0;
        notePool.length = 0;
        totalNotesCount = 0;
        perfectCount = 0;
        goodCount = 0;
        missCount = 0;

        currentDiff = diffKey;
        if (currentDiff === "easy") {
            laneCount = 2;
        } else {
            laneCount = 3;
        }

        currentLaneColors = [...laneColors];
        SetupPosition();
        updateKeyMap();

        const response = await fetch(jsonPath);
        const chartData = await response.json();
        const selectedChart = chartData.charts[diffKey];
        const audioRes = await fetch(chartData.audioPath);
        const arrayBuffer = await audioRes.arrayBuffer();
        audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

        let currentBPM = chartData.bpm;
        let currentBeat = chartData.beat;
        const offset = chartData.offset / 1000;
        let totalTime = 0;

        for (let line of selectedChart.lines) {
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
                let noteType = parseInt(char);
                if (laneCount === 2) {
                    if (noteType === 1) noteType = 3;
                    else if (noteType === 2) noteType = 2;
                    else if (noteType === 3) noteType = 5;
                }
                
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

    function spawnNote(type) {
        let note;
        if (notePool.length > 0) {
            note = notePool.pop();
        } else {
            note = new PIXI.Sprite();
        }
        note.visible = true;
        note.anchor.set(0.5);

        if (laneCount === 3 && type >= 4) {
            note.texture = noteTextures[`type${type}_3`];
        } else {
            note.texture = noteTextures[`type${type}`];
        }
        note.type = type;

        if (type <= 3) {
            note.width = LANE_W;
        } else {
            note.width = LANE_W * laneCount;
        }

        gameContainer.addChild(note);
        activeNotes.push(note);
        return note;
    }

    // ========================================
    // ゲーム開始・入力処理
    // ========================================
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
            const stage = currentKeyMap[e.code];
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

                        if (laneCount === 2) {
                            if (noteType === 3) { pencilAnimation([1], -1, false); }
                            else if (noteType === 2) { pencilAnimation([2], -1, false); }
                            else if (noteType === 5) { pencilAnimation([1, 2], 1, false); }
                        } else {
                            if (noteType === 1) { pencilAnimation([3], -1, false); }
                            else if (noteType === 2) { pencilAnimation([2], -1, false); }
                            else if (noteType === 3) { pencilAnimation([1], -1, false); }
                            else if (noteType === 4) { pencilAnimation([2, 3], 0, false); }
                            else if (noteType === 5) { pencilAnimation([1, 2], 1, false); }
                            else if (noteType === 6) { pencilAnimation([1, 3], 2, false); }
                        }
                    }

                    pressedStages = {};
                    inputDelayTimer = null;
                }, INPUT_DELAY_MS);
            }
        });
    }

    function getNoteType(stages) {
        if (laneCount === 2) {
            if (stages[2] && stages[3]) return 5; // 緑
            if (stages[3]) return 3; // 青
            if (stages[2]) return 2; // 黄
            return 0;
        } else {
            if (stages[1] && stages[2] && stages[3]) return -1;
            if (stages[1] && stages[2]) return 4; // 橙
            if (stages[2] && stages[3]) return 5; // 緑
            if (stages[3] && stages[1]) return 6; // 紫
            if (stages[1]) return 1; // 赤
            if (stages[2]) return 2; // 黄
            if (stages[3]) return 3; // 青
            return 0;
        }
    }

    function updateKeyMap() {
        if (laneCount === 2) {
            currentKeyMap = {
                "KeyF": 3, "KeyJ": 2
            }
            textKari.text = "左:Fキー\n右:Jキー";
        } else {
            currentKeyMap = {
                "KeyD": 3, "KeyF": 2, "KeyJ": 2, "KeyK": 1
            }
            textKari.text = "左:Dキー\n中央:F/Jキー\n右:Kキー";
        }
    }

    // ========================================
    // 判定・スコア処理
    // ========================================
    function judgeInput(type, pressedTime) {
        const currentTime = pressedTime - audioStartTime - JUDGE_OFFSET;
        let targetNote = null;
        let minDiff = Infinity;
        let diffMs = 0;
        let targetIndex = -1;

        for (let i = 0; i < activeNotes.length; i++) {
            const note = activeNotes[i];
            if (note.type === type) {
                const diff = currentTime - note.targetTime;
                if (Math.abs(diff) < minDiff && Math.abs(diff * 1000) <= JUDGE_WIDTH.MISS) {
                    minDiff = Math.abs(diff);
                    diffMs = diff * 1000;
                    targetNote = note;
                    targetIndex = i;
                }
            }
        }

        if (targetNote) {
            executeJudgement(targetNote, targetIndex, diffMs);
        }
    }

    function executeJudgement(note, index, diffMs) {
        const absDiffMs = Math.abs(diffMs);
        let judgement = "MISS";
        let color = "#ffffff";
        if (absDiffMs <= JUDGE_WIDTH.PERFECT) {
            judgement = "PERFECT";
            color = grdPerfect;
            perfectCount++;
            createParticles(note.x, judgeLine, note.type, 4);
        } else if (absDiffMs <= JUDGE_WIDTH.GOOD) {
            judgement = "GOOD";
            color = grdGood;
            goodCount++;
            createParticles(note.x, judgeLine, note.type, 2);
        } else if (absDiffMs <= JUDGE_WIDTH.MISS) {
            judgement = "MISS";
            color = grdMiss;
            missCount++;
        }

        showJudgement(judgement, color, diffMs);
        updateAccuracy();

        activeNotes.splice(index, 1);
        note.visible = false;
        notePool.push(note);
    }

    function showJudgement(judgement, color, diffMs) {
        judgeText.text = judgement;
        judgeText.alpha = 1.0;
        judgeText.style.fill = color;
        
        if (isShowDiff) {
            const rounded = Math.round(diffMs);
            let text = "";
            if (rounded > 0) {
                text = `+${rounded}ms`;
            } else if (rounded < 0) {
                text = `${rounded}ms`;
            } else {
                text = `0ms`;
            }
            diffText.text = text;
            diffText.alpha = 1.0;
            diffText.style.fill = color;
        } else {
            diffText.text = "";
        }
    }

    function updateAccuracy() {
        if (totalNotesCount === 0) {
            accuracyText.text = "0.00%";
            return;
        }

        const currentScore = (perfectCount * 1.0) + (goodCount * 0.75);
        const accuracy = (currentScore / totalNotesCount) * 100;

        accuracyText.text = `${accuracy.toFixed(2)}%`;
    }

    // ========================================
    // アニメーション・パーティクル処理
    // ========================================
    function pencilAnimation(stages, mixIndex, isBlack) {
        for (let i = 0; i < stages.length; i++) {
            const pencil = pencils[stages[i] - 1];
            if (isBlack) {
                pencil.texture = pencilTextures.black;
            } else if (mixIndex >= 0) {
                pencil.texture = pencilTextures.mix[mixIndex];
            } else {
                pencil.texture = pencilTextures.normal[pencil.defaultColorIndex];
            }

            if (isBlack) {
                currentLaneColors[stages[i] - 1] = 0x666666;
            } else if (mixIndex >= 0) {
                currentLaneColors[stages[i] - 1] = mixLaneColors[mixIndex];
            } else {
                currentLaneColors[stages[i] - 1] = laneColors[stages[i] - 1];
            }

            pencil.offsetY = -20;
        }
        drawLaneColors();
    }

    function createParticles(x, y, noteType, count) {
        const coreColor = noteColors[`type${noteType}`];

        // 削りカス
        for (let i = 0; i < count; i++) {
            const shape = Math.floor(Math.random() * 2);
            const particle = new PIXI.Container();

            const woodSprite = new PIXI.Sprite(particleTextures.shaving.wood[shape]);
            woodSprite.anchor.set(0.5);

            const coreSprite = new PIXI.Sprite(particleTextures.shaving.core[shape]);
            coreSprite.anchor.set(0.5);
            coreSprite.tint = coreColor;

            particle.addChild(woodSprite);
            particle.addChild(coreSprite);

            particle.x = x;
            particle.y = y;

            particle.rotation = Math.random() * Math.PI * 2;

            const angle = Math.random() * Math.PI * 2;
            const speed = 2;

            particle.vx = Math.cos(angle) * speed;
            particle.vy = Math.sin(angle) * speed;
            particle.rotSpeed = (Math.random() - 0.5) * 0.1;
            particle.alpha = 1.0;
            particle.life = 0.8;
            particle.decay = 0.02 + Math.random() * 0.015;

            particleContainer.addChild(particle);
            activeParticles.push(particle);
        }

        // 小さい破片
        for (let i = 0; i < count * 2; i++) {
            const chipTexture = particleTextures.chip[Math.floor(Math.random() * 2)];
            const particle = new PIXI.Sprite(chipTexture);
            particle.anchor.set(0.5);
            particle.tint = coreColor;

            particle.x = x;
            particle.y = y;

            particle.rotation = Math.random() * Math.PI * 2;

            const angle = Math.random() * Math.PI * 2;
            const speed = 2;

            particle.vx = Math.cos(angle) * speed;
            particle.vy = Math.sin(angle) * speed;
            particle.rotSpeed = (Math.random() - 0.5) * 0.1;
            particle.alpha = 1.0;
            particle.life = 0.8;
            particle.decay = 0.02 + Math.random() * 0.015;

            particleContainer.addChild(particle);
            activeParticles.push(particle);
        }

    }

    // ========================================
    // 曲選択・ボタン処理
    // ========================================
    const songButtons = document.querySelectorAll(".song-btn");

    function showGameScreen() {
        document.getElementById("select-screen").classList.add("hidden");
        document.getElementById("game-screen").classList.remove("hidden");
    }

    songButtons.forEach(button => {
        button.addEventListener("click", async (e) => {
            showGameScreen();
            const chartPath = e.currentTarget.dataset.chart;
            const diffKey = e.currentTarget.dataset.diff;
            await loadStage(chartPath, diffKey);
            startGame();
        });
    });

    // ========================================
    // メインループ
    // ========================================
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
                judgeText.alpha -= 0.01;
                if (judgeText.alpha < 0) {
                    judgeText.alpha = 0;
                }
                diffText.alpha = judgeText.alpha;
            }
        }

        let laneNeedRedraw = false;

        for (let i = 0; i < pencils.length; i++) {
            const pencil = pencils[i];
            if (pencil.offsetY < 0) {
                pencil.offsetY += pencilRecoverSpeed;
                if (pencil.offsetY > 0) {
                    pencil.offsetY = 0;
                    pencil.texture = pencilTextures.normal[pencil.defaultColorIndex];
                    if (currentLaneColors[i] !== laneColors[i]) {
                        currentLaneColors[i] = laneColors[i];
                        laneNeedRedraw = true;
                    }
                }
            }
            pencil.y = pencil.baseY + pencil.offsetY;
            
        }

        if (laneNeedRedraw) {
            drawLaneColors();
        }

        for (let i = activeParticles.length - 1; i >= 0; i--) {
            const p = activeParticles[i];

            p.x += p.vx;
            p.y += p.vy;
            p.rotation += p.rotSpeed;
            p.life -= p.decay;
            if (p.life > 0.3) {
                p.alpha = 1;
            } else {
                p.alpha = Math.max(0, p.life / 0.3);
            }

            if (p.life <= 0) {
                particleContainer.removeChild(p);
                p.destroy({ children: true });
                activeParticles.splice(i, 1);
            }
        }
    });
};