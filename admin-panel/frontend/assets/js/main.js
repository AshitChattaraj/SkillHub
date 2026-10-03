// ======================================
// PRELOADER
// ======================================

window.addEventListener("load", () => {

    const loader = document.getElementById("loader");

    if(loader){

        loader.classList.add("loader-hidden");

        setTimeout(() => {

            loader.style.display = "none";

        },600);

    }

});


// ======================================
// SCROLL PROGRESS BAR
// ======================================

const progressBar = document.getElementById("progressBar");

window.addEventListener("scroll",()=>{

    if(!progressBar) return;

    const totalHeight =
        document.documentElement.scrollHeight -
        document.documentElement.clientHeight;

    const progress =
        (window.pageYOffset / totalHeight) * 100;

    progressBar.style.width = progress + "%";

});


// ======================================
// BACK TO TOP BUTTON
// ======================================

const topBtn = document.getElementById("topBtn");

window.addEventListener("scroll",()=>{

    if(!topBtn) return;

    if(window.scrollY>500){

        topBtn.style.display="flex";

    }

    else{

        topBtn.style.display="none";

    }

});

if(topBtn){

    topBtn.addEventListener("click",()=>{

        window.scrollTo({

            top:0,

            behavior:"smooth"

        });

    });

}
// ======================================
// DARK MODE
// ======================================

const themeToggle = document.getElementById("themeToggle");

if(localStorage.getItem("theme") === "dark"){

    document.body.classList.add("dark-mode");

}

if(themeToggle){

    themeToggle.addEventListener("click",()=>{

        document.body.classList.toggle("dark-mode");

        if(document.body.classList.contains("dark-mode")){

            localStorage.setItem("theme","dark");

        }

        else{

            localStorage.setItem("theme","light");

        }

    });

}


// ======================================
// NAVBAR SCROLL EFFECT
// ======================================

const navbar = document.querySelector(".navbar");

window.addEventListener("scroll",()=>{

    if(!navbar) return;

    if(window.scrollY > 50){

        navbar.classList.add("shadow-lg");

        navbar.style.padding = "10px 0";

    }

    else{

        navbar.classList.remove("shadow-lg");

        navbar.style.padding = "18px 0";

    }

});


// ======================================
// SMOOTH SCROLL
// ======================================

document.querySelectorAll('a[href^="#"]').forEach(anchor=>{

    anchor.addEventListener("click",function(e){

        e.preventDefault();

        const target = document.querySelector(this.getAttribute("href"));

        if(target){

            target.scrollIntoView({

                behavior:"smooth",

                block:"start"

            });

        }

    });

});


// ======================================
// ACTIVE NAV LINK
// ======================================

const sections = document.querySelectorAll("section");

const navLinks = document.querySelectorAll(".navbar .nav-link");

window.addEventListener("scroll",()=>{

    let current = "";

    sections.forEach(section=>{

        const sectionTop = section.offsetTop - 150;

        const sectionHeight = section.clientHeight;

        if(window.scrollY >= sectionTop){

            current = section.getAttribute("id");

        }

    });

    navLinks.forEach(link=>{

        link.classList.remove("active");

        if(link.getAttribute("href") === "#" + current){

            link.classList.add("active");

        }

    });

});

// ======================================
// SCROLL REVEAL ANIMATION
// ======================================

const revealElements = document.querySelectorAll(".fade-up");

function revealOnScroll(){

    revealElements.forEach((element)=>{

        const windowHeight = window.innerHeight;

        const elementTop = element.getBoundingClientRect().top;

        const revealPoint = 120;

        if(elementTop < windowHeight - revealPoint){

            element.classList.add("show");

        }

    });

}

window.addEventListener("scroll", revealOnScroll);

window.addEventListener("load", revealOnScroll);


// ======================================
// COUNTER ANIMATION
// ======================================

const counters = document.querySelectorAll(".counter");

let counterStarted = false;

function startCounter(){

    if(counterStarted) return;

    const statsSection = document.getElementById("stats");

    if(!statsSection) return;

    const top = statsSection.getBoundingClientRect().top;

    if(top < window.innerHeight - 100){

        counterStarted = true;

        counters.forEach(counter=>{

            const target = +counter.getAttribute("data-target");

            let count = 0;

            const speed = target / 120;

            function updateCounter(){

                count += speed;

                if(count < target){

                    counter.innerText = Math.ceil(count);

                    requestAnimationFrame(updateCounter);

                }

                else{

                    counter.innerText = target;

                }

            }

            updateCounter();

        });

    }

}

window.addEventListener("scroll", startCounter);


// ======================================
// NEWSLETTER VALIDATION
// ======================================

const newsletterForm = document.getElementById("newsletterForm");

if(newsletterForm){

    newsletterForm.addEventListener("submit",(e)=>{

        e.preventDefault();

        const email =
            newsletterForm.querySelector("input[type='email']").value.trim();

        const emailPattern =
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if(!emailPattern.test(email)){

            alert("Please enter a valid email.");

            return;

        }

        alert("Thank you for subscribing!");

        newsletterForm.reset();

    });

}


// ======================================
// CARD HOVER EFFECT
// ======================================

const cards = document.querySelectorAll(".card,.feature-card,.stat-card");

cards.forEach(card=>{

    card.addEventListener("mouseenter",()=>{

        card.style.transform="translateY(-10px) scale(1.02)";

    });

    card.addEventListener("mouseleave",()=>{

        card.style.transform="translateY(0) scale(1)";

    });

});


// ======================================
// BUTTON RIPPLE EFFECT
// ======================================

document.querySelectorAll(".btn").forEach(button=>{

    button.addEventListener("click",function(e){

        const ripple = document.createElement("span");

        const rect = this.getBoundingClientRect();

        const size = Math.max(rect.width, rect.height);

        ripple.style.width = size + "px";

        ripple.style.height = size + "px";

        ripple.style.left = (e.clientX - rect.left - size/2) + "px";

        ripple.style.top = (e.clientY - rect.top - size/2) + "px";

        ripple.classList.add("ripple");

        this.appendChild(ripple);

        setTimeout(()=>{

            ripple.remove();

        },600);

    });

});

// Skill Hub Pro JS

console.log("Skill Hub Pro Loaded 🚀");

// Simple alert helper
function showAlert(msg) {
    alert(msg);
}

// Form validation example
function validateEmail(email) {
    const re = /\S+@\S+\.\S+/;
    return re.test(email);
}

// Button click animation effect
document.addEventListener("DOMContentLoaded", function () {
    let buttons = document.querySelectorAll(".btn");

    buttons.forEach(btn => {
        btn.addEventListener("click", function () {
            btn.style.transform = "scale(0.95)";
            setTimeout(() => {
                btn.style.transform = "scale(1)";
            }, 100);
        });
    });
});