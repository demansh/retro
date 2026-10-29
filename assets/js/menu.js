const POWER_OFF_MS = 350;

const terminal = document.querySelector(".terminal");
const items = Array.from(document.querySelectorAll(".menu__item"));
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
let selectedIndex = 0;
let isNavigating = false;

function select(index) {
  if (items.length === 0) {
    return;
  }
  selectedIndex = (index + items.length) % items.length;
  items.forEach((item, itemIndex) => item.classList.toggle("is-selected", itemIndex === selectedIndex));
}

function launch(item) {
  if (isNavigating) {
    return;
  }
  isNavigating = true;
  if (prefersReducedMotion) {
    window.location.assign(item.href);
    return;
  }
  terminal.classList.add("is-powering-off");
  window.setTimeout(() => window.location.assign(item.href), POWER_OFF_MS);
}

items.forEach((item, index) => {
  item.addEventListener("pointerenter", () => select(index));
  item.addEventListener("click", (event) => {
    event.preventDefault();
    select(index);
    launch(item);
  });
});

window.addEventListener("keydown", (event) => {
  if (event.code === "ArrowDown" || event.code === "KeyS") {
    event.preventDefault();
    select(selectedIndex + 1);
  } else if (event.code === "ArrowUp" || event.code === "KeyW") {
    event.preventDefault();
    select(selectedIndex - 1);
  } else if ((event.code === "Enter" || event.code === "Space") && items[selectedIndex]) {
    event.preventDefault();
    launch(items[selectedIndex]);
  }
});

window.addEventListener("pageshow", () => {
  isNavigating = false;
  terminal.classList.remove("is-powering-off");
});

select(0);
