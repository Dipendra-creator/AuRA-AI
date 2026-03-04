/* ===== GSAP & ScrollTrigger Setup ===== */
gsap.registerPlugin(ScrollTrigger)

/* ===== NAVBAR SCROLL EFFECT ===== */
window.addEventListener('scroll', () => {
  const navbar = document.getElementById('navbar')
  if (window.scrollY > 50) {
    navbar.classList.add('scrolled')
  } else {
    navbar.classList.remove('scrolled')
  }
})

/* ===== SMOOTH SCROLL FOR NAV LINKS ===== */
document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
  anchor.addEventListener('click', function (e) {
    e.preventDefault()
    const target = document.querySelector(this.getAttribute('href'))
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  })
})

/* ===== HERO ANIMATIONS ===== */
const heroTl = gsap.timeline({ delay: 0.3 })

heroTl
  .to('#hero-badge', { opacity: 1, y: 0, duration: 0.6, ease: 'power2.out' })
  .to(
    '.hero-line',
    {
      opacity: 1,
      y: 0,
      duration: 0.8,
      stagger: 0.15,
      ease: 'power3.out'
    },
    '-=0.2'
  )
  .to('#hero-subtitle', { opacity: 1, y: 0, duration: 0.6, ease: 'power2.out' }, '-=0.4')
  .to('#hero-actions', { opacity: 1, y: 0, duration: 0.6, ease: 'power2.out' }, '-=0.3')
  .to('#hero-stats', { opacity: 1, y: 0, duration: 0.6, ease: 'power2.out' }, '-=0.2')

/* Set initial states for hero elements */
gsap.set(['#hero-badge', '.hero-line', '#hero-subtitle', '#hero-actions', '#hero-stats'], {
  y: 30
})

/* ===== COUNTER ANIMATION ===== */
function animateCounters() {
  document.querySelectorAll('.stat-number').forEach((el) => {
    const target = parseFloat(el.dataset.count)
    const isDecimal = String(target).includes('.')
    gsap.to(el, {
      innerHTML: target,
      duration: 2,
      ease: 'power2.out',
      snap: { innerHTML: isDecimal ? 0.1 : 1 },
      onUpdate: function () {
        const val = parseFloat(el.innerHTML)
        el.innerHTML = isDecimal ? val.toFixed(1) : Math.round(val)
      }
    })
  })
}

// Trigger counter animation when hero stats are visible
ScrollTrigger.create({
  trigger: '#hero-stats',
  start: 'top 80%',
  onEnter: animateCounters,
  once: true
})

/* ===== PARALLAX HERO BACKGROUND ===== */
gsap.to('.hero-glow-1', {
  y: -100,
  scrollTrigger: {
    trigger: '#hero',
    start: 'top top',
    end: 'bottom top',
    scrub: 1
  }
})

gsap.to('.hero-glow-2', {
  y: -150,
  x: -50,
  scrollTrigger: {
    trigger: '#hero',
    start: 'top top',
    end: 'bottom top',
    scrub: 1.5
  }
})

gsap.to('.hero-orb-1', {
  y: -200,
  scrollTrigger: {
    trigger: '#hero',
    start: 'top top',
    end: 'bottom top',
    scrub: 0.8
  }
})

gsap.to('.hero-orb-2', {
  y: -120,
  scrollTrigger: {
    trigger: '#hero',
    start: 'top top',
    end: 'bottom top',
    scrub: 1.2
  }
})

gsap.to('.hero-content', {
  y: -80,
  opacity: 0.3,
  scrollTrigger: {
    trigger: '#hero',
    start: 'top top',
    end: 'center top',
    scrub: 1
  }
})

/* ===== PROBLEM / SOLUTION SECTION ===== */
gsap.to('#ps-problem', {
  opacity: 1,
  y: 0,
  duration: 0.8,
  ease: 'power2.out',
  scrollTrigger: {
    trigger: '#problem-solution',
    start: 'top 70%'
  }
})

gsap.to('#ps-solution', {
  opacity: 1,
  y: 0,
  duration: 0.8,
  ease: 'power2.out',
  delay: 0.3,
  scrollTrigger: {
    trigger: '#problem-solution',
    start: 'top 70%'
  }
})

/* Parallax list items */
gsap.utils.toArray('.ps-list li').forEach((li, i) => {
  gsap.from(li, {
    opacity: 0,
    x: i % 2 === 0 ? -20 : 20,
    duration: 0.5,
    delay: i * 0.1,
    scrollTrigger: {
      trigger: li,
      start: 'top 85%'
    }
  })
})

/* ===== FEATURES SECTION ===== */
gsap.from('#features-header', {
  opacity: 0,
  y: 40,
  duration: 0.8,
  ease: 'power2.out',
  scrollTrigger: {
    trigger: '#features',
    start: 'top 75%'
  }
})

gsap.utils.toArray('.feature-card').forEach((card, i) => {
  gsap.to(card, {
    opacity: 1,
    y: 0,
    duration: 0.7,
    ease: 'power2.out',
    delay: i * 0.15,
    scrollTrigger: {
      trigger: '#features-grid',
      start: 'top 75%'
    }
  })
})

/* ===== PRODUCT SHOWCASE — PINNED HORIZONTAL SCROLL ===== */
const productTrack = document.getElementById('product-track')
const productSlides = gsap.utils.toArray('.product-slide')
const totalSlides = productSlides.length

// Header animation
gsap.from('#product-header', {
  opacity: 0,
  y: 40,
  duration: 0.8,
  scrollTrigger: {
    trigger: '#product',
    start: 'top 75%'
  }
})

// Set first slide as active
if (productSlides.length > 0) {
  productSlides[0].classList.add('active')
}

// Horizontal scroll
const scrollDistance = () => productTrack.scrollWidth - window.innerWidth

gsap.to(productTrack, {
  x: () => -scrollDistance(),
  ease: 'none',
  scrollTrigger: {
    trigger: '#product-pin',
    pin: true,
    scrub: 1,
    start: 'top top',
    end: () => `+=${scrollDistance()}`,
    invalidateOnRefresh: true,
    onUpdate: (self) => {
      const progress = self.progress
      productSlides.forEach((slide, i) => {
        const slideProgress = i / (totalSlides - 1)
        const distance = Math.abs(progress - slideProgress)
        if (distance < 0.12) {
          slide.classList.add('active')
        } else {
          slide.classList.remove('active')
        }
      })
    }
  }
})

/* ===== HOW IT WORKS SECTION ===== */
gsap.from('#hiw-header', {
  opacity: 0,
  y: 40,
  duration: 0.8,
  scrollTrigger: {
    trigger: '#how-it-works',
    start: 'top 75%'
  }
})

const hiwSteps = gsap.utils.toArray('.hiw-step')
const hiwLineProgress = document.getElementById('hiw-line-progress')

// Animate each step
hiwSteps.forEach((step, i) => {
  gsap.to(step, {
    opacity: 1,
    x: 0,
    duration: 0.6,
    ease: 'power2.out',
    scrollTrigger: {
      trigger: step,
      start: 'top 80%',
      onEnter: () => step.classList.add('active')
    }
  })
})

// Progress line
ScrollTrigger.create({
  trigger: '#hiw-timeline',
  start: 'top 70%',
  end: 'bottom 60%',
  scrub: 1,
  onUpdate: (self) => {
    hiwLineProgress.style.height = `${self.progress * 100}%`
  }
})

/* ===== WAITLIST SECTION ===== */
gsap.to('#waitlist-wrapper', {
  opacity: 1,
  y: 0,
  duration: 0.8,
  ease: 'power2.out',
  scrollTrigger: {
    trigger: '#waitlist',
    start: 'top 70%'
  }
})

/* ===== WAITLIST FORM HANDLING ===== */
const form = document.getElementById('waitlist-form')
const submitBtn = document.getElementById('submit-btn')
const formMessage = document.getElementById('form-message')

// Load initial count
async function loadCount() {
  try {
    const res = await fetch('/api/waitlist/count')
    const data = await res.json()
    const countEl = document.getElementById('signup-count')
    gsap.to(countEl, {
      innerHTML: data.count,
      duration: 1.5,
      ease: 'power2.out',
      snap: { innerHTML: 1 }
    })
  } catch (err) {
    // Silently fail if server isn't running
  }
}

loadCount()

form.addEventListener('submit', async (e) => {
  e.preventDefault()

  const name = document.getElementById('wl-name').value.trim()
  const email = document.getElementById('wl-email').value.trim()
  const company = document.getElementById('wl-company').value.trim()

  if (!name || !email) return

  // Show loading
  submitBtn.querySelector('.btn-text').style.display = 'none'
  submitBtn.querySelector('.btn-loading').style.display = 'inline-flex'
  submitBtn.disabled = true
  formMessage.textContent = ''
  formMessage.className = 'form-message'

  try {
    const res = await fetch('/api/waitlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, company })
    })

    const data = await res.json()

    if (res.ok) {
      formMessage.textContent = '🎉 ' + data.message
      formMessage.className = 'form-message success'
      form.reset()

      // Update count
      if (data.count) {
        document.getElementById('signup-count').textContent = data.count
      }

      // Success animation
      gsap.fromTo(
        '.waitlist-form-card',
        {
          boxShadow: '0 0 0px rgba(0, 240, 255, 0)'
        },
        {
          boxShadow: '0 0 40px rgba(0, 240, 255, 0.2)',
          duration: 0.5,
          yoyo: true,
          repeat: 1
        }
      )
    } else {
      formMessage.textContent = data.error || 'Something went wrong.'
      formMessage.className = 'form-message error'
    }
  } catch (err) {
    formMessage.textContent = 'Network error. Please try again later.'
    formMessage.className = 'form-message error'
  } finally {
    submitBtn.querySelector('.btn-text').style.display = 'inline'
    submitBtn.querySelector('.btn-loading').style.display = 'none'
    submitBtn.disabled = false
  }
})

/* ===== REFRESH SCROLL TRIGGERS ON RESIZE ===== */
let resizeTimer
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer)
  resizeTimer = setTimeout(() => {
    ScrollTrigger.refresh()
  }, 250)
})
