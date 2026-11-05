import { ref } from 'vue';

/**
 * 全局只留一份 toast 队列，所以 ref 写在模块作用域而不是函数里。
 * 这样任意组件调用 useToast() 拿到的都是同一份数据 —— 常见的单例 composable 写法。
 */
const toasts = ref([]);
let seed = 0;

export function useToast() {
  function show(message) {
    const id = ++seed;
    toasts.value.push({ id, message });

    setTimeout(() => {
      toasts.value = toasts.value.filter((toast) => toast.id !== id);
    }, 2600);
  }

  return { toasts, show };
}
