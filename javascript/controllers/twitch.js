const vodCheckerIntervalMs = 500
const seekedDelayMs = 1000
const playerCheckTimeoutMs = 5000

class TwitchController extends DummyController {
    constructor(manager, cb) {
        super(manager, false)

        this.key = 'twitch'
        this.manager = manager
        this.context = this.manager.context

        this.element = null
        this.source = null
        this.duration = null
        this.media = null
        this.vodCheckerInterval = null
        this.playerCheckTimeout = null
        this.seekTimeout = null
        this.pending.pause = false
        this.pending.seek = null
        this.awaitingPlayingEvent = false
        this.playing = false
        this.stopped = true
        this.hooked = false
        this.showing = true

        this.canvas = document.createElement('canvas')

        const placeholder = document.createElement('div')
        const elementId = 'twitch-controller'

        placeholder.id = elementId

        this.container = document.body.appendChild(placeholder)
        this.container.style.opacity = '0.0'

        this.player = new Twitch.Player(elementId, {
            width: '100%',
            height: '100%',
            channel: 'twitchdev',
            autoplay: false,
            parent: location.hostname
        })

        this.player.addEventListener(Twitch.Player.READY, event => {
            this.container = document.getElementById(elementId)

            if (this.container.querySelector('iframe').contentDocument.querySelector('div.content-overlay-gate__allow-pointers > button:not([data-a-target="player-overlay-mature-accept"])')) {
                this.manager.controllerError(this, 'E_TWITCH_VOD_SUB_ONLY')
                this.stop()
            }
        })

        this.player.addEventListener(Twitch.Player.PLAY, event => {
            if (!this.hooked)
                this.hook()

            if (this.showing)
                this.container.style.opacity = '1.0'

            this.playing = true
            this.stopped = false
        })

        this.player.addEventListener(Twitch.Player.PLAYING, event => {
            this.awaitingPlayingEvent = false

            this.controls(this.container.querySelector('iframe').contentWindow.navigator.mediaSession)

            if (!this.duration)
                this.duration = this.player.getDuration() === Infinity ? -1 : this.player.getDuration()

            const mutedElement = this.container.querySelector('iframe').contentDocument.querySelector('div.muted-segments-alert__content')
            const mutedButton = mutedElement ? mutedElement.querySelector('button') : null
            const matureButton = this.container.querySelector('iframe').contentDocument.querySelector('button[data-a-target="player-overlay-mature-accept"]')

            if (mutedButton)
                mutedButton.click()

            if (matureButton)
                matureButton.click()

            this.manager.hideSpinner()

            if (this.pending.pause)
                this.pause()

            if (this.pending.seek)
                this.seek(this.pending.seek)
        })

        this.player.addEventListener(Twitch.Player.PAUSE, event => {
            this.playing = false
        })

        this.player.addEventListener(Twitch.Player.PLAYBACK_BLOCKED, event => {
            if (this.source && this.source.replace('channel:', '') === this.player.getChannel()) {
                this.manager.controllerError(this, 'E_TWITCH_PLAYBACK_BLOCKED')
                this.stop()
            }
        })

        this.player.addEventListener(Twitch.Player.OFFLINE, event => {
            if (this.source && this.source.replace('channel:', '') === this.player.getChannel()) {
                this.manager.controllerError(this, 'E_TWITCH_CHANNEL_OFFLINE')
                this.stop()
            }
        })

        this.player.addEventListener(Twitch.Player.ENDED, event => {
            if (this.playing)
                this.manager.controllerEnded(this)

            this.stop()
        })

        this.ready = true
        setTimeout(() => cb(), 0)
    }

    hook() {
        const element = this.container.querySelector('iframe').contentDocument.getElementsByTagName('video')[0]

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

            this.element.addEventListener('seeked', event => {
                clearTimeout(this.seekTimeout)
                this.seekTimeout = setTimeout(() => this.seeked(), seekedDelayMs)
            })

            this.media = this.context.createMediaElementSource(this.element)
            this.manager.controllerHooked(this)
        }

        this.hooked = true
    }

    play(muted) {
        if ((!this.source) || (!this.ready))
            return

        this.manager.showSpinner()

        if (this.stopped)
            this.set(this.source)

        this.awaitingPlayingEvent = true
        this.pending.pause = false
        this.player.setMuted(muted || this.pending.seek ? true : false)
        this.player.play()

        clearTimeout(this.playerCheckTimeout)
        clearInterval(this.vodCheckerInterval)

        this.playerCheckTimeout = setTimeout(() => {
            if (this.awaitingPlayingEvent)
                this.manager.controllerResync(this)
        }, playerCheckTimeoutMs)

        this.vodCheckerInterval = setInterval(() => {
            if (this.container.querySelector('iframe').contentDocument.querySelector('div.content-overlay-gate__allow-pointers > button:not([data-a-target="player-overlay-mature-accept"])')) {
                this.manager.controllerError(this, 'E_TWITCH_VOD_SUB_ONLY')
                this.stop()
                clearInterval(this.vodCheckerInterval)
            } else if (this.playing)
                clearInterval(this.vodCheckerInterval)
        }, vodCheckerIntervalMs)
    }

    pause() {
        if ((!this.source) || (!this.ready))
            return

        this.awaitingPlayingEvent = false
        this.pending.pause = false

        clearTimeout(this.playerCheckTimeout)
        clearInterval(this.vodCheckerInterval)

        if (this.playing) {
            this.duration = null
            this.player.pause()
        } else
            this.pending.pause = true
    }

    stop() {
        if ((!this.source) || (!this.ready))
            return

        this.duration = null
        this.awaitingPlayingEvent = false
        this.stopped = true
        this.pending.pause = false
        this.pending.seek = null
        this.container.style.opacity = '0.0'

        this.player.setChannel('twitchdev')
        this.player.pause()

        clearTimeout(this.playerCheckTimeout)
        clearInterval(this.vodCheckerInterval)

        this.manager.hideSpinner()
        this.seeked()
    }

    seek(time) {
        if ((!this.source) || (!this.ready))
            return

        clearTimeout(this.seekTimeout)

        this.seeking = true

        if (this.playing) {
            this.pending.seek = null
            this.player.seek(time)
            this.player.setMuted(false)
        } else
            this.pending.seek = time
    }

    set(source) {
        if ((!this.ready) || source === this.source)
            return

        if (!source) {
            this.stop()
            this.source = null
            return
        }

        this.container.style.opacity = '0.0'

        this.player.setChannel('twitchdev')
        this.player.pause()

        clearTimeout(this.playerCheckTimeout)
        clearInterval(this.vodCheckerInterval)

        this.playing = false
        this.awaitingPlayingEvent = false
        this.stopped = true
        this.source = source
        this.duration = null
        this.seeked()

        if (this.source.startsWith('channel:'))
            this.player.setChannel(this.source.replace('channel:', ''))
        else if (this.source.startsWith('video:'))
            this.player.setVideo(this.source.replace('video:', ''))
    }

    time() {
        return (this.source && this.ready && this.player.getCurrentTime()) || 0
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

        if (!this.stopped)
            this.container.style.opacity = '1.0'
    }

    hide() {
        this.showing = false
        this.container.style.opacity = '0.0'
    }
}
