(function () {

    /* INIT PHASE */

    /*AUDIO context and related properties*/
    var AudioContext = window.AudioContext || window.webkitAudioContext
    var audioContext
    var playing = false
    var file
    var pauseButton
    var analyser
    var Coord
    var frequencies, waveforms

    const MAXBYTE = 255
    const HALFBYTE = 128
    const PI2 = Math.PI * 2

    /*GRAPHICS context, sizingInfo properties*/
    var body
    var container = document.querySelector("#canvasContainer")
    var clientWidth, clientHeight
    var offsetX, offsetY
    var cx_FPS, cy_FPS
    var ORIGIN
    const smallScreen = 750
    var growthFactor
    var canvas = document.getElementById("scope");
    var ctx = canvas.getContext('2d');
    setSizingInfo()
    ctx.lineWidth = factor > 1200 ? 9 : (factor > 1000 ? 7 : (factor > 750 ? 5 : (factor > 640 ? 4 : (
        factor > 500 ? 3 : (factor > 360 ? 2 : 1)))))

    //DJ KNOBS' SECTION
    var controlDefaults = {

        pointStyle: "stroke",
        pointColor: 360,
        pointRadius: .1,
        pointTrigger: .80,
        multiplier: .2,
        centerEffects: "none",
        centerData: "waveforms",
        dataset: "waveforms",
        centerMultiplier: .2,
        centerRadius: .2,
        centerColor: 360,
        fftSize: 1024,
        gridSize: 5,
        gridPoints: true,
        endPoints: true,
        paintAlpha: .03,
        paintStroke: 1,
        backgroundColor: "#000000",
        defaultWindow: "weaver",
        paintMode: false,
        lineWidth: ctx.lineWidth,
        initialLineWidth: ctx.lineWidth,
        shapeColorFunc: "triad2",
        gridPointsColorFunc:"tetrad",
        centerColorFunc:"burst1"

    }
    var controls = {

        update: function (config) {
            for (key in config) {
                controls[key] = config[key]
            }
        },
        themes: new Themes(),
        preset: {
            value: "PsychedelicBoombox",
            change: function (e) {

                controls.preset.value = e.target.value
                updatePreset(controls.preset.value)
            }
        },
        radioStations:{
            value:"",
            change:function(e){
                autoPlay(e.target.value)
            }
        }
    }
    initControls()

    /***** END INITIALIZATION PHASE. POWER UP THE BASS CANNON ******/
    function updatePreset(themeKey) {

        let theme = controls.themes.find(t => t.key === themeKey)
        if (theme.fftSize === undefined) {
            theme.fftSize = controlDefaults.fftSize
        }
        //fftSize_change:
        if (analyser) {
            analyser.fftSize = theme.fftSize
            frequencies = new Uint8Array(analyser.frequencyBinCount)
            waveforms = new Uint8Array(analyser.fftSize)
        }

        controls.update(controlDefaults)
        controls.update(theme)
        controls.styledShapes = theme.styledShapes

        //additional DEFAULT control settings to the styled shapes:
        controls.styledShapes.forEach(ss => {

            if (ss.multiplier === undefined) ss.multiplier = controlDefaults.multiplier
            if (ss.dataset === undefined) ss.dataset = controlDefaults.dataset
            if (ss.windowFunc === undefined) ss.windowFunc = controlDefaults.defaultWindow
        })

        Coord = new CartesianCoord({
            width: canvas.width,
            height: canvas.height,
            gridSize: theme.gridSize || controlDefaults.gridSize,
            offsetX: offsetX,
            offsetY: offsetY,
            themes: controls.themes,
            controlDefaults: controlDefaults
        })

        Coord.points.forEach(p => {
            p.hide = undefined
            p.endpoint = false
        })
        controls.styledShapes.forEach(styledShape => {
            Coord.markPoints(styledShape.shapeKey)
        })

        if (theme.lineWidthMultiplier) {
            ctx.lineWidth = ctx.lineWidth * theme.lineWidthMultiplier
            controls.lineWidth = ctx.lineWidth
        } else {
            ctx.lineWidth = controls.initialLineWidth
            controls.lineWidth = controls.initialLineWidth
        }

        setBackgroundColorsFromConfig()
    }

    function initControls() {

        updatePreset(controls.preset.value)
        let presets = document.querySelector("#ctl_presets")

        controls.themes.forEach(theme => {
            //fill in the theme <options>
            let el = document.createElement("option")
            let text = theme.name
            el.value = theme.key
            el.append(text)
            presets.appendChild(el)
            document.getElementById("ctl_presets").addEventListener("change", controls.preset.change)
            document.getElementById("radioStations").addEventListener("change", controls.radioStations.change)

        })
        setBackgroundColorsFromConfig()

        ctx.font = `${factor>smallScreen?150:100}% monospace`
        ctx.fillStyle = controls.color
        ctx.textAlign = "center"
        ctx.fillText('Please select a track or station', ORIGIN.x, ORIGIN.y)

    }


    /*** MAIN method ***/
    var analyzeTrack = (audioContext, srcNode) => {

        analyser = audioContext.createAnalyser();
        analyser.fftSize = controls.fftSize
        analyser.connect(audioContext.destination);
        srcNode.connect(analyser);

        //fftSize/2 = frequency bin count
        frequencies = new Uint8Array(analyser.frequencyBinCount);
        waveforms = new Uint8Array(analyser.fftSize);


        /*~~~~THE LOOP~~~~*/
        //var i = 0;
        //var fps = 0
        //var t0, t1
        const loop = (time) => {

            //t0 = performance.now();
            requestAnimationFrame(loop)

            if (playing) {

                analyser.getByteTimeDomainData(waveforms)
                analyser.getByteFrequencyData(frequencies)

                if (!controls.paintMode) ctx.clearRect(0, 0, canvas.width, canvas.height)

                //loop init variables
                const MAX = Math.max(...waveforms)
                growthFactor = MAX / MAXBYTE

                //dumb, move this out of the loop
                let dataMap = {
                    "waveforms": waveforms,
                    "frequencies": frequencies,
                }
                if (controls.pointStyle === "stroke") drawGridPoints({
                    data: dataMap[controls.centerData]
                })
                controls.styledShapes.forEach((styled) => {

                    drawShape({
                        lines: Coord.getShape(styled.shapeKey).lines,
                        data: dataMap[styled.dataset],
                        color: styled.color,
                        multiplier: styled.multiplier,
                        windowFunc: windowFunctions[styled.windowFunc || controlDefaults.defaultWindow].value,
                        lineMode: styled.lineMode
                    })
                })
                if (controls.pointStyle === "fill") drawGridPoints({
                    data: dataMap[controls.centerData]
                })
                // if (i % 60 == 0) {
                //     t1 = performance.now()
                //     fps = Math.floor(1 / ((t1 - t0) / 1000))
                //     //console.log(`requestAnimFrame took ${t1-t0} ms.`)
                // }
            }
            //i++
        }

        //srcNode.playbackRate.value = 1
        if(srcNode instanceof MediaElementAudioSourceNode){
            srcNode.created = true
        } else {
            srcNode.start()   
        }
        playing = true

        loop()
        return srcNode
    }
    /***  END MAIN   ***/

    /* DRAWING functions */
    function drawShape(options) {

        //shape, data, valuefunc, color
        var data = options.data
        var lines = options.lines

        var color = options.color
        if (controls.shapeColorFunc !== "flat") {

            var tiny = tinycolor(color)
            var complement = tiny.spin(180).toHexString()
            var triad = tiny.spin(120).toHexString()
            var tetrad = tiny.spin(90).toHexString()
            var analog = tiny.spin(30).toHexString()
            var twin = tiny.spin(10).toHexString()
            switch (controls.shapeColorFunc) {
                case "complement":
                    color = growthFactor > .9 ? complement : growthFactor > .8 ? triad : growthFactor > .7 ? tetrad : growthFactor > .6 ? analog : color
                    break
                case "triad4":
                    color = growthFactor > .85 ? triad : growthFactor > .75 ? tetrad : growthFactor > .65 ? analog : color
                    break
                case "triad2":
                    color = growthFactor > .85 ? triad : growthFactor > .8? analog : color
                    break
                case "analog":
                    color = growthFactor > .85 ? analog : color
                    break
                case "twin":
                    color = growthFactor > .8 ? color : twin
                    break
            }

        }

        var multiplier = (options.multiplier === undefined ? 1 : options.multiplier) * -1 //reversing canvas coords y axis
        var windowFunc = options.windowFunc
        var lineMode = options.lineMode || "lines"

        var valueFunc

        function waveValue(byteValue, availableWidth, index, multiplier) {
            let value = ((byteValue - HALFBYTE) / MAXBYTE * (availableWidth)) * multiplier
            return (value * windowFunc(index, analyser.fftSize))
        }
        var freqValue = (byteValue, availableWidth, index, multiplier) => {
            let value = (byteValue / MAXBYTE * (availableWidth)) * multiplier
            return (value * windowFunc(index, analyser.frequencyBinCount))
        }
        var axisValue = (i, n, totalWidth) => {
            return (i + 1) / n * (totalWidth)
        }
        if (options.data === waveforms) {
            valueFunc = waveValue
        } else {
            valueFunc = freqValue
        }

        lines.forEach((line => {

            if (line.inverted) {
                var invertedValue = (b, w, i, m) => {
                    return -1 * valueFunc(b, w, i, m)
                }
            }
            drawLine({
                p1: line.p1,
                p2: line.p2,
                value: invertedValue || valueFunc
            })
        }))

        function drawLine(options) {
            //p1, p2, data, valueFunc, color, multiplier
            var p1 = options.p1
            var p2 = options.p2

            const rise = p2.y - p1.y
            const run = p2.x - p1.x
            const m = rise / run

            const length = Math.sqrt(Math.pow(run, 2) + Math.pow(rise, 2))
            const angle = Math.atan(m)

            ctx.strokeStyle = color;
            ctx.fillStyle = color;

            ctx.save()
            ctx.translate(p1.x, p1.y)
            ctx.rotate(angle)
            ctx.translate(-p1.x, -p1.y)

            ctx.beginPath()
            ctx.moveTo(p1.x, p1.y)

            var lw = ctx.lineWidth

            data.forEach((w, i) => {

                let deltaX = axisValue(i, data.length, length)
                if (run < 0) deltaX = -deltaX

                let x = deltaX + p1.x
                let y = options.value(w, canvas.height, i, multiplier) + p1.y

                if (lineMode === "bars") {
                    ctx.moveTo(x, p1.y)
                    ctx.lineTo(x, y)
                } else if (lineMode === "dots") {
                    ctx.fillRect(x, y, lw, lw)
                } else { //lines
                    ctx.lineTo(x, y)
                }

            })
            ctx.stroke()
            ctx.restore()
        }

    }

    var drawGridPoints = (options) => {

        if (controls.centerEffects === "none" && !controls.gridPoints && !controls.endPoints) return
        let data = options.data

        //grid points
        const pointRadius = controls.pointRadius //% of line
        const pointStyle = controls.pointStyle
       

        const peak = controls.pointTrigger

        //center point
        let centerMultiplier = controls.centerMultiplier
        let centerEffects = controls.centerEffects
        let centerRadius = controls.centerRadius //% of line
        let centerHue = controls.centerColor

        let radius = ((factor / Coord.points.filter((point) => point.row == 1).length) * pointRadius)
        const normalGrowth = growthFactor - .5
        radius = radius + (normalGrowth * radius * 2) //max gf = 1, min = .5.

        let inner, outer
        const dotHue = controls.pointColor * (growthFactor)
        
            var tiny = tinycolor(`hsl(${dotHue}, 100%, 50%)`)
            var color = tiny.toHexString()
            var complement = tinycolor(color).spin(-180).toHexString()
            var triad = tinycolor(color).spin(-120).toHexString()
            var tetrad = tinycolor(color).spin(-90).toHexString()
            var analog = tinycolor(color).spin(-30).toHexString()
            var twin = tinycolor(color).spin(10).toHexString()
            
            switch (controls.gridPointsColorFunc) {
                case "complement":
                    outer = growthFactor > .9 ? complement : growthFactor > .8 ? triad : growthFactor > .7 ? tetrad : growthFactor > .6 ? analog : color
                    inner = color
                    break
                case "triad":
                    inner = color
                    outer = growthFactor > .85 ? triad : growthFactor > .75 ? tetrad : color
                    break
                case "tetrad":
                    outer = color
                    inner = growthFactor > .85 ? tetrad : growthFactor > .75 ? analog : color
                    break
                case "analog":
                    outer = growthFactor > .75 ? analog : twin
                    inner = color
                    break
                case "twin":
                    inner = twin
                    outer = color
                    break
            }

        
        let centerColor
        let flat = tinycolor(`hsl(${centerHue}, 100%, 50%)`)
        let tinygrow =  tinycolor(`hsl(${centerHue*growthFactor}, 100%, 50%)`)
        switch (controls.centerColorFunc) {
            case "burst3":
                centerColor = growthFactor > .9 ? tinygrow.spin(180).toHexString() : growthFactor > .8 ? tinygrow.spin(120).toHexString() : growthFactor > .7 ?  tinygrow.spin(90).toHexString() : growthFactor > .6 ?  tinygrow.spin(30).toHexString() : tinygrow.toHexString()
                break
            case "burst2":
                centerColor = growthFactor > .85 ? tinygrow.spin(120).toHexString() : growthFactor > .75 ? tinygrow.spin(90).toHexString()  : tinygrow.toHexString()
                break
            case "burst1":
                centerColor = growthFactor > .85 ? tinygrow.spin(90).toHexString() : growthFactor > .75 ? tinygrow.spin(30).toHexString() : tinygrow.toHexString()
                break
            case "flat2":
                centerColor = growthFactor > .85 ? flat.spin(90).toHexString() : growthFactor > .75 ? flat.spin(30).toHexString() : flat.toHexString()
                break
            case "flat1":
                centerColor =  growthFactor > .85 ? flat.spin(30).toHexString() : flat.toHexString()
                break
        }


        let origin = Coord.origin()
        if (centerEffects != "none") {

            drawCircle({
                data: data,
                baseRadius: centerRadius,
                multiplier: centerMultiplier,
                centerEffects: centerEffects,
                point: origin,
                color: centerColor
            })
        }
        Coord.points.forEach((point, i) => {

            if (point.endpoint || (!point.hide && controls.gridPoints)) {


                if (!point.endpoint) {
                    if (growthFactor > peak) {

                        if (point !== origin || controls.centerEffects === "none") Circle(point, radius, outer, inner, pointStyle)

                    }
                } else {
                    if (controls.endPoints) {
                        Circle(point, radius, outer, inner, pointStyle)
                    }

                }

            }
        })

        function drawCircle(options) {

            let totalLength = options.data.length
            let mult = options.multiplier
            let originX = options.point.x
            let originY = options.point.y
            let data = options.data
            let lw = ctx.lineWidth
            let r = options.baseRadius
            let centerEffects = options.centerEffects

            //ctx.save()
            ctx.beginPath()
            data.forEach((w, i) => {
                let degrees = 270 + (i / totalLength) * 360
                let rads = degrees * (Math.PI / 180)

                let cosT = Math.cos(rads)
                let sinT = Math.sin(rads)

                let cx = r * cosT + originX
                let cy = r * sinT + originY

                val = circleValue(w, i, canvas.height, mult) + r

                let cx2 = val * cosT + originX
                let cy2 = val * sinT + originY

                switch (centerEffects) {
                    case "bars": {
                        ctx.strokeStyle = options.color
                        ctx.moveTo(cx, cy)
                        ctx.lineTo(cx2, cy2)
                        break;
                    }
                    case "dots": {
                        ctx.fillStyle = options.color
                        ctx.fillRect(cx2, cy2, lw, lw)
                        break;
                    }
                }


            })
            ctx.stroke()
            //ctx.restore()

            function circleValue(byteValue, index, availableWidth, multiplier) {

                return (byteValue / MAXBYTE * (availableWidth)) * multiplier

            }

        }

    }

    var Circle = (p, r, color1, color2, style) => {

        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, PI2, true)
        ctx.strokeStyle = color1
        ctx.fillStyle = color1
        switch (style) {
            case 'stroke':
                ctx.stroke();
                break;
            case 'fill':
                ctx.fill();
                break;
        }
        ctx.beginPath()
        ctx.arc(p.x, p.y, (3 * r) / 4, 0, PI2, true)
        ctx.strokeStyle = color2
        ctx.fillStyle = color2
        switch (style) {
            case 'stroke':
                ctx.stroke();
                break;
            case 'fill':
                ctx.fill();
                break;
        }
    }

    /*********************  HELPERS **********************/
    function setBackgroundColorsFromConfig() {
        let body = document.getElementsByTagName("body")[0]
        body.style.backgroundColor = controls.backgroundColor
        controls.color = readableComplement(controls.backgroundColor);
        body.style.color = controls.color;
        [...document.querySelectorAll("input, select, a")].forEach(input => {
            input.style.backgroundColor = controls.backgroundColor
            input.style.color = controls.color
        })
    }

    function setSizingInfo() {
        const cssWidth = clientWidth = container.clientWidth;
        const cssHeight = clientHeight = container.clientHeight;

        factor = clientWidth > clientHeight ? clientHeight : clientWidth
        offsetY = clientHeight * .04
        offsetX = clientWidth * .04

        cy_FPS = offsetY / 2
        cx_FPS = clientWidth - (offsetX)

        if (canvas.width !== cssWidth || canvas.height !== cssHeight) {
            canvas.width = cssWidth;
            canvas.height = cssHeight;
        }
        ORIGIN = new Point(canvas.width / 2, canvas.height / 2)
        //console.log(`factor:${factor},linewidth:${ctx.lineWidth}`)
    }

    var readAudioFile = (context, file) => {

        var reader = new FileReader();
        var src = context.createBufferSource();

        return new Promise((resolve, reject) => {

            reader.onload = function (e) {
                var arrayBuffer = e.currentTarget.result;
                context.decodeAudioData(arrayBuffer, function (audioBuffer) {
                    src.buffer = audioBuffer;
                    resolve(src);
                })
            }
            reader.readAsArrayBuffer(file);
        })
    }

    songChanged = () => {

        file = document.querySelector("#songDropdown").files[0];
        if (!file) return false;

        if (audioContext) audioContext.close();
        audioContext = new AudioContext()

        //change to spinner while loading:
        pauseButton = document.querySelector(".pause")
        pauseButton.style["pointer-events"] = "none"
        pauseButton.classList.remove("fa-play")
        pauseButton.classList.add("fa-pause")
        pauseButton.classList.add("fa-spin")

        readAudioFile(audioContext, file).then(srcNode => {
            srcNode.onended = function (event) {
                audioContext.close();
                playing = false;
                //if we get to end of track change button back to play.
                pauseButton.classList.remove("fa-pause")
                pauseButton.classList.add("fa-play")
            }.bind(this);
            analyzeTrack(audioContext, srcNode);

            //song should be playing, so stop spinning:
            pauseButton.style["pointer-events"] = "auto"
            pauseButton.classList.remove("fa-spin")

        })
    }

    autoPlay = (url) => {
                
        if (audioContext) audioContext.close();
        audioContext = new AudioContext()
        let audio = new Audio()
        
        audio.crossOrigin = "anonymous"
        audio.src = url
        audio.type = "audio/mpeg"    
        audio.preload = "preload"
        audio.autoplay = "autoplay"
     
        //audio.volume = 1;
        let src = audioContext.createMediaElementSource(audio);
        analyzeTrack(audioContext, src)

    }

    pauseSong = (el) => {
        if (!audioContext) {
            return false;
        }
        if (audioContext.state === 'running') {
            //pause:
            audioContext.suspend().then(function () {
                playing = false;
                pauseButton.classList.remove("fa-pause")
                pauseButton.classList.add("fa-play")
            }.bind(this));
        } else if (!playing && audioContext.state === 'suspended') {
            //resume:
            audioContext.resume().then(function () {
                playing = true;
                pauseButton.classList.remove("fa-play")
                pauseButton.classList.add("fa-pause")
            }.bind(this));
        } else if (!playing && audioContext.state === 'closed') {
            //play last selected song:
            songChanged();
        } else {

        }
    } //TODO export these public functions!

    function CartesianCoord(options) {

        var self = this
        var width = options.width
        var height = options.height
        this.rows = options.gridSize
        this.cols = options.gridSize
        //offsetX, offsetY
    
        this.origin = () => {
            return this.points[Math.floor(this.points.length / 2)]
        }
        /*top*/
        this.topLeft = () => {
            return this.points[0]
        }
        this.topRight = () => {
            return this.points.filter(p => p.row == 1).slice(-1)[0]
        }
        this.topMid = () => {
            let firstRow = this.points.filter(p => p.row == 1)
            return firstRow[Math.floor(firstRow.length / 2)]
        }
        this.top25 = () => {
            let firstRow = this.points.filter(p => p.row == 1)
            return firstRow[Math.floor(firstRow.length / 4)]
        }
        this.top75 = () => {
            let firstRow = this.points.filter(p => p.row == 1)
            return firstRow[Math.floor((firstRow.length / 4) * 3)]
        }
        /*bottom*/
        this.bottomLeft = () => {
            return this.points.filter(p => p.col == 1).slice(-1)[0]
        }
        this.bottomMid = () => {
            let lastRow = this.points.filter(p => p.row == this.rows)
            return lastRow[Math.floor(lastRow.length / 2)]
        }
        this.bottomRight = () => {
            return this.points[this.points.length - 1]
        }
        this.bottom25 = () => {
            let lastRow = this.points.filter(p => p.row == this.rows)
            return lastRow[Math.floor(lastRow.length / 4)]
        }
        this.bottom75 = () => {
            let lastRow = this.points.filter(p => p.row == this.rows)
            return lastRow[Math.floor((lastRow.length / 4) * 3)]
        }
        /*left */
        this.leftMid = () => {
            let firstCol = this.points.filter(p => p.col == 1)
            return firstCol[Math.floor(firstCol.length / 2)]
        }
        this.left25 = () => {
            let firstCol = this.points.filter(p => p.col == 1)
            return firstCol[Math.floor(firstCol.length / 4)]
        }
        this.left75 = () => {
            let firstCol = this.points.filter(p => p.col == 1)
            return firstCol[Math.floor((firstCol.length / 4) * 3)]
        }
        /*right*/
        this.right25 = () => {
            let lastCol = this.points.filter(p => p.col == this.cols)
            return lastCol[Math.floor(lastCol.length / 4)]
        }
        this.rightMid = () => {
            let lastCol = this.points.filter(p => p.col == this.cols)
            return lastCol[Math.floor(lastCol.length / 2)]
        }
        this.right75 = () => {
            let lastCol = this.points.filter(p => p.col == this.cols)
            return lastCol[Math.floor((lastCol.length / 4) * 3)]
        }
    
        /*center vertical */
        this.centerY75 = () => {
    
            let middleCol = this.points.filter(p => p.col == Math.ceil(this.cols / 2))
            let delta = Math.floor((middleCol.length / 4) * 3)
            return middleCol[delta]
        }
        this.centerY25 = () => {
            let middleCol = this.points.filter(p => p.col == Math.ceil(this.cols / 2))
            let delta = Math.floor(middleCol.length / 4)
            return middleCol[delta]
        }
        /*center horizontal*/
        this.centerX75 = () => {
    
            let middleRow = this.points.filter(p => p.row == Math.ceil(this.rows / 2))
            let delta = Math.floor((middleRow.length / 4) * 3)
            return middleRow[delta]
        }
        this.centerX25 = () => {
            let middleRow = this.points.filter(p => p.row == Math.ceil(this.rows / 2))
            let delta = Math.floor(middleRow.length / 4)
            return middleRow[delta]
        }
        /* quads */
        this.quad1Center = () => {
            let rowNum = Math.ceil(this.rows * .25)
            return this.points.filter(p => p.row === rowNum && p.col === rowNum)[0]
        }
        this.quad2Center = () => {
            let rowNum = Math.ceil(this.rows * .25)
            let colNum = Math.ceil(this.rows * .75)
            return this.points.filter(p => p.row === rowNum && p.col === colNum)[0]
        }
        this.quad3Center = () => {
            let rowNum = Math.ceil(this.rows * .75)
            let colNum = Math.ceil(this.rows * .25)
            return this.points.filter(p => p.row === rowNum && p.col === colNum)[0]
        }
        this.quad4Center = () => {
            let rowNum = Math.ceil(this.rows * .75)
            return this.points.filter(p => p.row === rowNum && p.col === rowNum)[0]
        }
    
        this.pointFunctions = [
    
            {
                key: "origin",
                name: "origin",
                value: this.origin
            },
            //top
            {
                key: "topLeft",
                name: "top left",
                value: this.topLeft
            },
            {
                name: "Top Right",
                key: "topRight",
                value: this.topRight
            },
            {
                key: "topMid",
                name: "top Mid",
                value: this.topMid
            },
            {
                name: "top 25%",
                key: "top25",
                value: this.top25
            },
            {
                key: "top75",
                name: "top 75%",
                value: this.top75
            },
            //bottom
            {
                key: "bottomMid",
                name: "bottom Mid",
                value: this.bottomMid
            },
            {
                key: "bottomLeft",
                name: "bottom Left",
                value: this.bottomLeft
            },
            {
                name: "bottom Right",
                key: "bottomRight",
                value: this.bottomRight
            },
            {
                key: "bottom25",
                name: "bottom 25%",
                value: this.bottom25
            },
            {
                name: "bottom 75%",
                key: "bottom75",
                value: this.bottom75
            },
            //left side
            {
                name: "left Mid",
                key: "leftMid",
                value: this.leftMid
            },
            {
                name: "left 25%",
                key: "left25",
                value: this.left25
            },
            {
                key: "left75",
                name: "left 75%",
                value: this.left75
            },
            //right side
            {
                key: "rightMid",
                name: "right Mid",
                value: this.rightMid
            },
            {
                key: "right25",
                name: "right 25%",
                value: this.right25
            },
            {
                key: "right75",
                name: "right 75%",
                value: this.right75
            },
            //center X Axis
            {
                key: "centerX25",
                name: "center X 25%",
                value: this.centerX25
            },
            {
                key: "centerX75",
                name: "center X 75%",
                value: this.centerX75
            },
            //center Y AYis
            {
                key: "centerY25",
                name: "center Y 25%",
                value: this.centerY25
            },
            {
                key: "centerY75",
                name: "center Y 75%",
                value: this.centerY75
            },
            //Quadrant centers
            {
                key: "quad1",
                name: "Quad 1 center",
                value: this.quad1Center
    
            },
            {
                key: "quad2",
                name: "Quad 2 center",
                value: this.quad2Center
            },
            {
                key: "quad3",
                name: "Quad 3 center",
                value: this.quad3Center
    
            },
            {
                key: "quad4",
                name: "Quad 4 center",
                value: this.quad4Center
    
            },
    
        ]
    
        this.determineGridPoints = function () {
    
            self.points = []
            let totalWidth = width - options.offsetX * 2
            let totalHeight = height - options.offsetY * 2
            for (var i = 0; i < this.rows; i++) {
    
                var deltaY = (i / (this.rows - 1)) * totalHeight
                for (var j = 0; j < this.cols; j++) {
    
                    var deltaX = (j / (this.cols - 1)) * totalWidth
                    let x = deltaX + options.offsetX
                    let y = deltaY + options.offsetY
                    let p = new Point(x, y)
                    p.row = i + 1
                    p.col = j + 1
                    //console.log("pushing point:" + p.row + "," + p.col)
                    self.points.push(p)
                }
            }
    
        }
        self.determineGridPoints()
    
        self.markPoints = (shapeKey) => {
    
            let shape = self.getShape(shapeKey)
            var m, b
            shape.lines.forEach((line, i) => {
    
                let p1 = line.p1
                p1.endpoint = true
                let p2 = line.p2
                p2.endpoint = true
    
                const deltaY = p2.row - p1.row
                const deltaX = p2.col - p1.col
                m = deltaY / deltaX
                b = p1.row - m * p1.col
    
                if (m === Infinity || m === -Infinity) {
                    iterateAndMark(p1, p2, "row", "col")
                } else {
                    iterateAndMark(p1, p2, "col", "row")
                }
            })
    
            function iterateAndMark(p1, p2, ind, dep) {
    
                const parity = p2[ind] < p1[ind] ? -1 : 1
                const range = Math.abs(p2[ind] - p1[ind]) - 1
                for (var i = 1; i <= range; i++) {
                    const varied = p1[ind] + (parity * i)
                    const target = ind === "row" ? p1[dep] : m * varied + b
                    let point = self.points.find(p => p[ind] == varied && p[dep] == target)
                    if (point) {
                        //console.log(`point hide (x): ${point.row},${point.col}`)
                        point.hide = true
                    }
                }
    
            }
        }
    
        self.getShape = function (key, options) {
            let shape = self.shapes.find(function (s) {
                return s.key === key
            })
            return shape
        }
    
        self.getNamesFromConfig = (lineConfigs) => {
    
            let names = []
            lineConfigs.forEach(config => {
                names.push(config.line[0])
            })
            if (lineConfigs.length === 1) {
                names.push(lineConfigs[0].line[1])
            }
            return names
    
        }
    
        self.generateLinesFromConfig = (lineConfigs) => {
    
            let lines = []
            lineConfigs.forEach(config => {
    
                let p1 = self.pointFunctions.find(pf => pf.key === config.line[0]).value()
                let p2 = self.pointFunctions.find(pf => pf.key === config.line[1]).value()
    
                lines.push(new Line(p1, p2, {
                    inverted: config.inverted
                }))
    
            })
            return lines
    
        }
    
        //SHAPE INIT    
        self.shapes = new DefaultShapes()
    
        //generate shapes for custom shapes in themes
        options.themes.forEach(theme => {
           
            theme.styledShapes.forEach(ss => {
    
               if (ss.shapeKey === undefined || /^custom/i.test(ss.shapeKey)) {
                    let key = ss.shapeKey
                    if(key === undefined) key = `Custom_${ss.lineConfigs.length}_${GUID()}_${theme.key}`
                    let lines = self.generateLinesFromConfig(ss.lineConfigs)
                    let customShapeForTheme = {
                        name: key,
                        key: key,
                        type: "custom",
                        lines: lines,
                        lineConfigs: ss.lineConfigs
                    }
                    ss.shapeKey = key
                    self.shapes.push(customShapeForTheme)
                }
            })
    
        })
    
        //SHAPE UPDATE
        self.updateShapeLinesFromConfig = () => {
    
            self.shapes.forEach(sh => {
                sh.lines = self.generateLinesFromConfig(sh.lineConfigs)
            })
        }
        self.updateShapeLinesFromConfig()
    
        /*helpers*/
        function DefaultShapes() {
    
            return [
                {
                    name: "Outer Box",
                    key: "OuterBox",
                    type: "preset",
                    lineConfigs: [{
                            line: ["topRight", "topLeft"]
                        },
                        {
                            line: ["topRight", "bottomRight"]
                        },
                        {
                            line: ["bottomLeft", "bottomRight"],
                            inverted: true
                        },
                        {
                            line: ["bottomLeft", "topLeft"]
                        }
                    ]
                },
                {
                    name: "X",
                    key: "X",
                    type: "preset",
                    lineConfigs: [{
                            line: ["topLeft", "bottomRight"]
                        },
                        {
                            line: ["topRight", "bottomLeft"]
                        }
                    ]
                },
                {
                    name: "X (anchored)",
                    key: "XAnchored",
                    type: "preset",
                    lineConfigs: [{
                            line: ["topLeft", "origin"]
                        },
                        {
                            line: ["topRight", "origin"],
                            inverted: true
                        },
                        {
                            line: ["bottomLeft", "origin"]
                        },
                        {
                            line: ["bottomRight", "origin"]
                        }
                    ]
                },
                {
                    name: "Diamond (suit) ♦",
                    key: "Diamond",
                    type: "preset",
                    lineConfigs: [{
                            line: ["topMid", "rightMid"]
                        },
                        {
                            line: ["bottomMid", "rightMid"]
                        },
                        {
                            line: ["bottomMid", "leftMid"]
                        },
                        {
                            line: ["leftMid", "topMid"]
                        }
                    ]
                },
                {
                    name: "Diamond (jewel)",
                    key: "Jewel",
                    type: "preset",
                    lineConfigs: [{
                            line: ["left25", "top25"]
                        },
                        {
                            line: ["bottomMid", "left25"]
                        },
                        {
                            line: ["bottomMid", "right25"]
                        },
                        {
                            line: ["right25", "top75"]
                        },
                        {
                            line: ["top75", "top25"]
                        }
                    ]
                },
                {
                    name: "Greek Cross ✚",
                    key: "GreekCross",
                    type: "preset",
                    lineConfigs: [{
                            line: ["leftMid", "rightMid"]
                        },
                        {
                            line: ["bottomMid", "topMid"]
                        }
                    ]
                },
                {
                    name: "Greek Cross ✚ (anchored)",
                    key: "GreekCrossAnchored",
                    type: "preset",
                    lineConfigs: [{
                            line: ["topMid", "origin"]
                        },
                        {
                            line: ["rightMid", "origin"],
                            inverted:true
                        },
                        {
                            line: ["leftMid", "origin"]
                        },
                        {
                            line: ["bottomMid", "origin"]
                        },
                    ]
                },
                {
                    name: "Latin Cross ✝",
                    key: "LatinCross",
                    type: "preset",
                    lineConfigs: [{
                            line: ["quad1", "quad2"]
                        },
                        {
                            line: ["topMid", "bottomMid"]
                        }
                    ]
                },
                {
                    name: "Peace ☮",
                    key: "PeaceSign",
                    type: "preset",
                    lineConfigs: [{
                            line: ["topMid", "origin"]
                        },
                        {
                            line: ["origin", "quad3"]
                        },
                        {
                            line: ["origin", "quad4"]
                        },
                        {
                            line: ["origin", "centerY75"]
                        }
                    ]
                },
                {
                    name: "Star of David ✡",
                    key: "StarOfDavid",
                    type: "preset",
                    lineConfigs: [{
                            line: ["topMid", "quad3"]
                        }, {
                            line: ["topMid", "quad4"]
                        }, {
                            line: ["quad3", "quad4"]
                        },
                        {
                            line: ["bottomMid", "quad1"]
                        }, {
                            line: ["bottomMid", "quad2"]
                        }, {
                            line: ["quad2", "quad1"]
                        }
                    ]
                },
                {
                    name: "Infinity ∞",
                    key: "Infinity",
                    type: "preset",
                    lineConfigs: [{
                        line: ["quad1", "bottomRight"]
                    }, {
                        line: ["bottomRight", "topRight"]
                    }, {
                        line: ["topRight", "bottom25"]
                    }, {
                        line: ["bottom25", "quad1"]
                    }]
                },
                {
                    name: "Heart ❤",
                    key: "Heart",
                    type: "preset",
                    lineConfigs: [{
                            line: ["bottomMid", "left25"]
                        },
                        {
                            line: ["left25", "top25"]
                        },
                        {
                            line: ["top25", "centerY25"]
                        },
                        {
                            line: ["bottomMid", "right25"]
                        },
                        {
                            line: ["right25", "top75"]
                        },
                        {
                            line: ["top75", "centerY25"]
                        }
    
                    ]
                },
                {
                    name: "Tree 🌲",
                    key: "Tree",
                    type: "preset",
                    lineConfigs: [{
                        line: ["bottomMid", "centerY75"]
                    }, {
                        line: ["centerY75", "quad3"]
                    }, {
                        line: ["quad3", "topMid"]
                    }, {
                        line: ["topMid", "quad4"]
                    }, {
                        line: ["quad4", "centerY75"]
                    }]
                },
                {
                    name: ":)",
                    key: "smiley",
                    type: "preset",
                    lineConfigs: [{
                            line: ["leftMid", "quad3"]
                        },
                        {
                            line: ["quad3", "quad4"]
                        },
                        {
                            line: ["quad4", "rightMid"]
                        },
                        {
                            line: ["quad1", "quad1"]
                        },
                        {
                            line: ["quad2", "quad2"]
                        },
                    ]
                }
            ]
        } //end Shapes
        
        function Line(p1, p2, options) {
            this.p1 = p1
            this.p2 = p2
            this.inverted = (options && options.inverted) || false
        }
    } //end CartesianCoord
})("Visit me at sweaverD.com!");