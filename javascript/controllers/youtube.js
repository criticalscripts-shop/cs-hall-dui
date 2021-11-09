const pauseSeekedTimeoutMs = 250
const checkIntervalMs = 500

class YouTubeController extends DummyController {
    constructor(manager) {
        super(manager, false)

        this.key = 'youtube'
        this.manager = manager
        this.context = this.manager.context

        this.element = null
        this.source = null
        this.duration = null
        this.media = null
        this.playCheckInterval = null
        this.hasScreenshotSupport = true
        this.pending.seek = null
        this.pending.stop = false
        this.pending.pause = false
        this.pending.play = false
        this.playing = false
        this.hooked = false
        this.showing = true

        this.canvas = document.createElement('canvas')

        const placeholder = document.createElement('div')
        const elementId = 'youtube-controller'

        placeholder.id = elementId
        
        this.container = document.body.appendChild(placeholder)
        this.container.style.display = 'none'
        
        const setPlayer = () => {
            if ((!YT) || (!YT.Player))
                return setTimeout(setPlayer, checkIntervalMs)

            this.player = new YT.Player(elementId, {
                width: '100%',
                height: '100%',

                host: 'https://www.youtube-nocookie.com',

                playerVars: {
                    autoplay: 0,
                    muted: 1,
                    controls: 0,
                    playsinline: 1,
                    showinfo: 0,
                    rel: 0,
                    cc_load_policy: 3,
                    iv_load_policy: 3,
                    modestbranding: 1
                },

                embedOptions: {},
                preload: true,
                events: {
                    onReady: event => {
                        this.container = document.getElementById(elementId)
                        this.hook()
                    },

                    onError: event => {
                        this.manager.controllerError(this, `E_YOUTUBE_ERROR`)

                        if ((this.player.getPlayerState() === YT.PlayerState.ENDED || this.player.getPlayerState() === -1) && this.playing)
                            this.manager.controllerEnded(this)

                        if (this.player.getPlayerState() === YT.PlayerState.PLAYING)
                            this.playing = true
                        else
                            this.playing = false
                    },

                    onStateChange: event => {
                        if (this.player.getPlayerState() === YT.PlayerState.PLAYING)
                            this.controls(this.player.getIframe().contentWindow.navigator.mediaSession)

                        if ((this.player.getPlayerState() === YT.PlayerState.ENDED || this.player.getPlayerState() === -1) && this.playing)
                            this.manager.controllerEnded(this)

                        if (this.player.getPlayerState() === YT.PlayerState.PLAYING)
                            this.playing = true
                        else
                            this.playing = false

                        if (this.pending.pause && this.player.getPlayerState() === YT.PlayerState.PLAYING)
                            this.pause()

                        if (this.pending.stop && this.player.getPlayerState() === YT.PlayerState.PLAYING)
                            this.stop()

                        if ((this.player.getPlayerState() === YT.PlayerState.PLAYING || this.player.getPlayerState() === YT.PlayerState.PAUSED || this.player.getPlayerState() === YT.PlayerState.BUFFERING) && this.showing)
                            this.container.style.display = 'block'
                        else
                            this.container.style.display = 'none'

                        if (this.pending.seek && (this.player.getPlayerState() === YT.PlayerState.PLAYING || this.player.getPlayerState() === YT.PlayerState.PAUSED))
                            this.seek(this.pending.seek)

                        if (this.hooked && (this.player.getPlayerState() === YT.PlayerState.ENDED || this.player.getPlayerState() === -1))
                            this.hooked = false
                        else if ((this.player.getPlayerState() === YT.PlayerState.PLAYING || this.player.getPlayerState() === YT.PlayerState.BUFFERING) && (!this.hooked))
                            this.hook()

                        if (this.player.getPlayerState() === YT.PlayerState.PLAYING && (!this.duration))
                            this.duration = this.player.getCurrentTime() < 1 ? (this.player.getDuration() ? this.player.getDuration() : -1) : -1

                        if (this.player.getPlayerState() === YT.PlayerState.PLAYING)
                            this.seeked()
                    }
                }
            })
        }

        if (YT)
            setPlayer(this)
        else
            window.onYouTubeIframeAPIReady = () => setPlayer(this)

        const checkInterval = setInterval(() => {
            if (this.container && this.player && this.player.cueVideoById) {
                this.ready = true
                clearInterval(checkInterval)
            }
        }, checkIntervalMs)
    }

    hook() {
        const element = this.player.getIframe().contentDocument.getElementsByTagName('video')[0]

        if (!element) {
            this.manager.controllerError(this, 'E_SOURCE_NOT_FOUND')
            this.hooked = false
            this.element = null
            this.stop()
            return
        }

        if (element !== this.element) {
            if (this.media)
                this.media.disconnect()

            this.element = element
            this.media = this.context.createMediaElementSource(this.element)
            this.manager.controllerHooked(this)
        }

        this.hooked = true
    }

    play(muted) {
        if ((!this.source) || (!this.player))
            return

        this.pending.stop = false
        this.pending.pause = false
        this.pending.play = true

        if (muted || this.pending.seek)
            this.player.mute()
        else
            this.player.unMute()

        this.playCheckInterval = setInterval(() => {
            if (typeof(this.player.getPlayerState()) === 'undefined')
                return

            if (this.pending.play)
                this.player.playVideo()

            clearInterval(this.playCheckInterval)
        }, 50)
    }

    pause() {
        if ((!this.source) || (!this.player))
            return

        this.pending.play = false

        clearInterval(this.playCheckInterval)

        if (this.player.getPlayerState() === YT.PlayerState.PLAYING) {
            this.pending.pause = false
            this.player.pauseVideo()
        } else
            this.pending.pause = true
    }
    
    stop() {
        if ((!this.source) || (!this.player))
            return

        this.duration = null
        this.pending.seek = null
        this.pending.pause = false
        this.pending.play = false
        this.seeked()

        clearInterval(this.playCheckInterval)
   
        if (this.player.getPlayerState() === YT.PlayerState.PLAYING || this.player.getPlayerState() === YT.PlayerState.PAUSED) {
            this.pending.stop = false
            this.player.stopVideo()
        } else
            this.pending.stop = true
    }

    seek(time) {
        if ((!this.source) || (!this.player))
            return

        if (this.player.getPlayerState() === YT.PlayerState.PLAYING || this.player.getPlayerState() === YT.PlayerState.PAUSED) {
            this.pending.seek = null
            this.player.seekTo(time)
            this.player.unMute()
            this.seeking = true

            clearTimeout(this.pauseSeekedTimeout)

            this.pauseSeekedTimeout = setTimeout(() => {
                if (!this.playing)
                    this.seeked()
            }, pauseSeekedTimeoutMs)
        } else
            this.pending.seek = time
    }

    set(source) {
        if (!source) {
            this.stop()
            this.source = null
            return
        }

        this.source = source
        this.duration = null
        this.player.cueVideoById(this.source)
        this.seeked()
    }

    time() {
        return (this.source && this.player && this.player.getCurrentTime()) || 0
    }

    screenshot() {
        if ((!this.element) || (!this.playing) || (!this.source) || (!this.player) || this.element.clientWidth <= 0 || this.element.clientHeight <= 0)
            return null

        this.canvas.width = this.element.clientWidth
        this.canvas.height = this.element.clientHeight
        this.canvas.getContext('2d').drawImage(this.element, 0, 0, this.canvas.width, this.canvas.height)

        const image = new Image()

        image.width = this.canvas.width
        image.height = this.canvas.height
        image.src = this.canvas.toDataURL()

        return image
    }

    dynamic() {
        return true
    }

    show() {
        this.showing = true

        if (this.player.getPlayerState() === YT.PlayerState.PLAYING || this.player.getPlayerState() === YT.PlayerState.PAUSED || this.player.getPlayerState() === YT.PlayerState.BUFFERING)
            this.container.style.display = 'block'
    }

    hide() {
        this.showing = false
        this.container.style.display = 'none'
    }
}
