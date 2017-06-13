import Vue from 'vue'
import VueRouter from 'vue-router'

Vue.use(VueRouter)

const load = type => name => () =>
  System.import(`./${type}/${name}.vue`)

const layout = load('layouts')
const page = load('pages')
const component = load('components')

export default new VueRouter({
  routes: [
    {
      path: '/',
      component: layout('base'),
      children: [
        {
          name: 'Home',
          path: '/',
          component: page('home')
        },

        {
          name: 'About',
          path: 'about',
          component: page('about')
        },

        {
          name: 'Login',
          path: 'login',
          component: page('login')
        }
      ]
    },

    {
      path: '/init',
      component: page('init')
    },

    {
      Name: 'Error',
      path: '*',
      component: component('Error404')
    }
  ]
})