import {Toast, Loading, AppFullscreen} from 'quasar'
import {Socket} from 'phoenix'
import {mapState, mapGetters} from 'vuex'
import axios from 'utils/axios'
import Gravatar from 'components/gravatar.vue'

/*
 * Make a numerical string with at least two diigits.
 * Useful for our clock.
 */
const twoDigits = x => {
  const str = x.toString()

  return str.length === 1
    ? `0${str}`
    : str
}

/*
 * State Enum
 * Replicates the server Enum.
 * See: Poker.Web.Game
 */
const CREATED = 0
const IDLE = 1
const VOTING = 2
const DISCUSSION = 3

export default {
  name: 'Game',

  components: {Gravatar},

  data: () => ({
    /* Socket */
    socket: false,
    channel: false,

    /* Time */
    now: 0,

    /* Selected Card */
    selectedCard: false,

    /*
     * Game
     * This mimicks the server Poker.Web.Game module
     * therefore we have snake_cased data.
     */
    state: 0,
    current_story: false,
    scores: {},
    time: false,
    votes: {},

    /*
     * Presence
     * Users works like a database to cache user data
     * instead of receiving everytime we receive messages
     * and other things.
     * Users start false to not render anything on the template
     * Online and offline state are computed values.
     */
    users: false,
    onlineIds: [],

    /* Chat */
    anonymous: false,
    messages: [],
    message: '',

    /* Backlog */
    order: [],
    stories: {}
  }),

  computed: {
    ...mapGetters(['loggedUser']),

    ...mapState({
      token: state => state.auth.token
    }),

    projectId() {
      return +this.$route.params.projectId
    },

    backlog() {
      return this.order
        .map(id => this.stories[id])
    },

    /* Membership */
    role() {
      const membership = this.users[this.loggedUser.id]
      return membership
        ? membership.role
        : 'team'
    },

    /* Presence */
    online() {
      return this.onlineIds
        .map(id => this.users[id])
    },

    offline() {
      return Object.values(this.users)
        .filter(user => !this.onlineIds.includes(user.id))
    },

    /* Timer */
    timer() {
      /*
       * If there's no timer we can't count.
       * If the game was just created, we don't need a timer.
       * If it's idle we don't need it too.
       */
      if (!this.time || this.created || this.idle) {
        return false
      }

      /*
       * Voting has a countdown.
       * this.time will hold the end.
       * this.time - this.now shows our time
       */
      if (this.voting) {
        if (this.time < this.now) {
          return false
        }

        const difference = this.time - this.now
        return {
          minutes: twoDigits(Math.trunc(difference / 60) % 60),
          seconds: twoDigits(difference % 60)
        }
      }

      /*
       * Discussion timer is a chronometer.
       * this.time holds the start.
       * this.now - this.time shows our time
       */
      const difference = this.now - this.time
      return {
        minutes: twoDigits(Math.max(0, Math.trunc(difference /60) % 60)),
        seconds: twoDigits(Math.max(0, difference % 60))
      }
    },

    /* State helpers */
    created() {
      return this.state === CREATED
    },

    idle() {
      return this.state === IDLE
    },

    voting() {
      return this.state === VOTING
    },

    discussion() {
      return this.state === DISCUSSION
    }
  },

  created() {
    setInterval(this.tick, 500)
    this.connectToGame()
  },

  beforeDestroy() {
    clearInterval(this.tick)

    if (this.channel) {
      this.channel.leave()
    }
  },

  watch: {
    // Just in case someone change the URL ¯\_(ツ)_/¯
    projectId() {
      this.connectToGame()
    }
  },

  methods: {
    /* connectToGame */
    connectToGame() {
      Loading.show({
        message: 'Connecting to server',
        delay: 0
      })

      if (!this.socket) {
        this.socket = new Socket('/socket', {params: {token: this.token}})
        this.socket.connect()
      }

      if (this.channel) {
        this.channel.leave()
      }

      const channelName = `game:${this.projectId}`
      const channelParams = {}
      this.channel = this.socket.channel(channelName, channelParams)

      this.channel.on('game_state', this.channelGameState)
      this.channel.on('message', this.channelMessage)
      this.channel.on('story_updated', this.channelStoryUpdated)
      this.channel.on('presence_state', this.channelPresenceState)
      this.channel.on('presence_diff', this.channelPresenceDiff)

      this.channel.join()
        .receive('ok', this.channelJoined)
        .receive('error', this.channelRejected)
    },

    /* Initial Data Loads */
    loadMembers() {
      axios.get(`/projects/${this.projectId}/members`)
        .then(this.membersLoaded)
        .catch(this.membersLoadFail)
    },

    membersLoaded(response) {
      this.users = response.data.reduce((acc, member) =>
        Object.assign(acc, {
          [member.user.id]: {
            ...member.user,
            // useful for tests later
            role: member.role
          }
        })
      , {})
    },

    membersLoadFail(_error) {
      Toast.create.negative('Failed to load members')
    },

    loadBacklog() {
      axios.get(`/projects/${this.projectId}/backlog`)
        .then(this.backlogLoaded)
        .catch(this.backlogLoadFail)
    },

    backlogLoaded(response) {
      this.order = response.meta.order
      this.stories = response.data
    },

    backlogLoadFail(_error) {
      Toast.create.negative('Failed to load backlog')
    },

    /* Message Passing */
    sendMessage() {
      if (!this.message.length) {
        return
      }

      this.channel.push('message', {anonymous: this.anonymous, body: this.message})
      this.message = ''
    },

    /* Select Story */
    selectStory(story) {
      this.channel.push('select_story', story.id)
    },

    /* Voting */
    startVoting() {
      this.channel.push('start_voting')
    },

    stopVoting() {
      this.channel.push('stop_voting')
    },

    selectCard(card) {
      if (this.voting) {
        this.selectedCard = card
        return this.channel.push('set_vote', card)
      }

      if (!this.role === 'manager') {
        return
      }

      this.channel.push('set_score', card)
    },

    /* Channel Events */
    channelJoined() {
      Loading.hide()
      Loading.show({
        message: 'Loading data',
        delay: 0
      })

      Promise.all([this.loadMembers(), this.loadBacklog()])
        .then(Loading.hide)
    },

    channelRejected({reason}) {
      Loading.hide()

      if (reason === 'unauthorized') {
        return Toast.create.negative('Unauthorized to join at game server')
      }

      if (reason === 'not found') {
        return Toast.create.negative('Project not found')
      }

      Toast.create.negative('Failed to connect to game server')
    },

    channelGameState({game}) {
      // Reset selected card when a new voting start
      if (this.state !== game.state) {
        this.selectedCard = false
      }

      Object.assign(this, game)
    },

    channelMessage(message) {
      this.messages.push(message)
    },

    channelStoryUpdated({story}) {
      this.stories = {
        ...this.stories,
        [story.id]: story
      }
    },

    channelPresenceState(joins) {
      this.channelPresenceDiff({joins, leaves: {}})
    },

    channelMessage({message}) {
      this.messages.push(message)

      const ref = this.$refs['layout-view']
      ref.scrollTop = ref.scrollHeight
      const ref2 = this.$refs['layout-padding']
      ref2.scrollTop = ref2.scrollHeight
    },

    channelPresenceDiff({leaves, joins}) {
      // TODO: handle multiple devices properly
      const joinsIds = Object.keys(joins).map(Number)
      const leavesIds = Object.keys(leaves).map(Number)

      const next = [...this.onlineIds].concat(joinsIds)

      leavesIds.forEach(id => {
        const index = next.findIndex(idX => idX === id)

        if (index !== -1) {
          next.splice(index, 1)
        }
      })

      this.onlineIds = next
    },

    /* Time */
    tick() {
      this.now = Math.trunc((new Date()).getTime() / 1000)
    },

    /* Full Screen */
    tryFullScreen() {
      if (AppFullscreen.isActive()) {
        return AppFullscreen.toggle()
      }

      AppFullscreen.request()
    }
  }
}
