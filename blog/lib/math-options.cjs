// Shared by Hexo and the browser preview; never allow trusted HTML commands.
module.exports = {
  nonStandard: true, // 中文紧邻 $x$ 时也能识别。
  throwOnError: false,
  trust: false,
  strict: 'warn',
  maxExpand: 1000,
  maxSize: 20,
};
