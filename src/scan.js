/**
 * https://github.com/lizongying/tricode
 */
window.onload = () => {
    const video = document.getElementById('webcam')
    const tip = document.getElementById('tip')
    const result = document.getElementById('result')
    const canvas = document.getElementById('canvas')
    const container = document.getElementById('canvasContainer')

    const scan = document.getElementById('scan')
    const copy = document.getElementById('copy')

    const ctx = canvas.getContext('2d', { willReadFrequently: true })

    let renderId = 0

    let detectCount = 0
    let isScanned = false

    const DETECT_INTERVAL = 30

    let worker = null

    const setCanvasFullContainer = () => {
        const containerW = container.clientWidth * window.devicePixelRatio
        const containerH = container.clientHeight * window.devicePixelRatio

        canvas.width = containerW
        canvas.height = containerH
    }

    const getVideoRenderRect = () => {
        const canvasW = canvas.width
        const canvasH = canvas.height
        const videoW = video.videoWidth
        const videoH = video.videoHeight

        const videoRatio = videoW / videoH
        const canvasRatio = canvasW / canvasH

        let renderX = 0,
            renderY = 0,
            renderW = 0,
            renderH = 0

        if (videoRatio > canvasRatio) {
            renderH = canvasH
            renderW = canvasH * videoRatio
            renderX = (canvasW - renderW) / 2
        } else {
            renderW = canvasW
            renderH = canvasW / videoRatio
            renderY = (canvasH - renderH) / 2
        }

        return { x: renderX, y: renderY, w: renderW, h: renderH }
    }

    const playBeep = () => {
        const audioContext = new window.AudioContext()
        const oscillator = audioContext.createOscillator()
        const gainNode = audioContext.createGain()

        oscillator.connect(gainNode)
        gainNode.connect(audioContext.destination)

        oscillator.frequency.setValueAtTime(1200, audioContext.currentTime)
        gainNode.gain.setValueAtTime(0.1, audioContext.currentTime)

        oscillator.start()
        oscillator.stop(audioContext.currentTime + 0.2)
    }

    const initWorker = () => {
        if (worker) {
            return
        }

        try {
            worker = new Worker(new URL('./detector.js', import.meta.url), {
                type: 'module',
            })

            worker.onmessage = (e) => {
                const res = e.data
                // console.log('res', res)
                if (res.success) {
                    // isScanned = true
                    // alert(`掃碼成功：${res.text}`)
                    result.textContent = res.text
                    playBeep()
                    // stopCamera()
                    // terminateWorker()
                }
            }

            worker.onerror = (err) => {
                console.error(err)
                terminateWorker()
            }
        } catch (err) {
            console.error(err)
            worker = null
        }
    }

    async function initCamera() {
        if (video.srcObject) {
            return
        }
        try {
            video.srcObject = await navigator.mediaDevices?.getUserMedia({
                video: {
                    facingMode: { ideal: 'environment' },
                    width: { ideal: 1080 },
                    height: { ideal: 1920 },
                },
            })

            video.onloadedmetadata = async () => {
                await video.play()
                setCanvasFullContainer()
                renderWithEffects()
            }
        } catch (err) {
            console.error(err)
        }
    }

    const renderWithEffects = () => {
        if (video.paused || isScanned) return

        ctx.clearRect(0, 0, canvas.width, canvas.height)

        const renderRect = getVideoRenderRect()

        ctx.drawImage(
            video,
            0,
            0,
            video.videoWidth,
            video.videoHeight,
            renderRect.x,
            renderRect.y,
            renderRect.w,
            renderRect.h,
        )

        const minSide = Math.min(canvas.width, canvas.height)
        const baseLength = minSide * 0.9
        const triangleHeight = baseLength * (Math.sqrt(3) / 2)

        const point1X = (canvas.width - baseLength) / 2
        const point1Y = canvas.height / 2 + triangleHeight / 3
        const point3Y = point1Y - triangleHeight

        tip.style.top = `calc(${point3Y / dpr}px - 3rem)`
        result.style.top = `calc(${point1Y / dpr}px + 1rem)`

        detectCount++
        if (detectCount >= DETECT_INTERVAL) {
            detectCount = 0
            const w = Math.floor(baseLength)
            const h = Math.floor(triangleHeight)
            const imageData = ctx.getImageData(point1X, point3Y, w, h)
            if (worker) {
                worker.postMessage(
                    {
                        imageData: imageData.data,
                        width: w,
                        height: h,
                    },
                    [imageData.data.buffer],
                )
            }
        }

        renderId = requestAnimationFrame(renderWithEffects)
    }

    const stopCamera = () => {
        if (!renderId) {
            return
        }
        cancelAnimationFrame(renderId)
        const stream = video.srcObject
        if (stream) {
            stream.getTracks().forEach((track) => track.stop())
            video.srcObject = null
        }
    }

    const terminateWorker = () => {
        if (worker) {
            worker.terminate()
            worker = null
        }
    }

    window.addEventListener('pageshow', () => {
        initWorker()
        initCamera().then()
    })

    window.addEventListener('beforeunload', () => {
        stopCamera()
        terminateWorker()
    })

    const maskCanvas = document.getElementById('maskCanvas')
    const maskCtx = maskCanvas.getContext('2d')
    const dpr = window.devicePixelRatio || 1

    const initMask = () => {
        const viewportWidth = window.innerWidth
        const viewportHeight = window.innerHeight

        maskCanvas.width = viewportWidth * dpr
        maskCanvas.height = viewportHeight * dpr
        maskCanvas.style.width = `${viewportWidth}px`
        maskCanvas.style.height = `${viewportHeight}px`
        maskCtx.scale(dpr, dpr)

        const minSide = Math.min(viewportWidth, viewportHeight)
        const baseLength = minSide * 0.9
        const triangleHeight = baseLength * (Math.sqrt(3) / 2)

        const point1X = (viewportWidth - baseLength) / 2
        const point1Y = viewportHeight / 2 + triangleHeight / 3
        const point2X = (viewportWidth + baseLength) / 2
        const point2Y = point1Y
        const point3X = viewportWidth / 2
        const point3Y = point1Y - triangleHeight

        maskCtx.fillStyle = 'rgba(0, 0, 0, 0.7)'
        maskCtx.fillRect(0, 0, viewportWidth, viewportHeight)

        maskCtx.save()

        maskCtx.strokeStyle = '#ffffff'
        maskCtx.lineWidth = 1
        maskCtx.beginPath()
        maskCtx.moveTo(point1X, point1Y)
        maskCtx.lineTo(point2X, point2Y)
        maskCtx.lineTo(point3X, point3Y)
        maskCtx.closePath()
        maskCtx.stroke()

        maskCtx.beginPath()
        maskCtx.moveTo(point1X, point1Y)
        maskCtx.lineTo(point2X, point2Y)
        maskCtx.lineTo(point3X, point3Y)
        maskCtx.closePath()
        maskCtx.globalCompositeOperation = 'destination-out'
        maskCtx.fill()
        maskCtx.restore()
    }

    initWorker()
    initCamera().then()
    initMask()

    scan.onclick = () => {
        result.textContent = ''
    }

    /**
     * Copy text to the clipboard (for modern browsers)
     * @param {string} text - The text content to be copied
     * @returns {Promise<string>} - Returns the copied text on success, throws an error message on failure
     */
    async function copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text)
            console.log('Copy successful!')
            return text
        } catch (error) {
            console.error('Copy failed: ', error)
            throw new Error('複製失敗，請手動複製')
        }
    }

    copy.onclick = async () => {
        try {
            await copyToClipboard(result.textContent)
            alert('複製成功')
        } catch (err) {
            alert(err.message)
        }
    }

    window.addEventListener('resize', () => {
        setCanvasFullContainer()
        initMask()
    })
}
