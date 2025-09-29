import puppeteer from 'puppeteer';
import path from 'path';
import fs from 'fs';
import axios from 'axios';
// import ColorThief from 'colorthief'; //根据头像获取主题色

// 格式化插件名称
function formatPluginName(name) {
  if (!name) return '';

  // 特殊替换规则
  if (name.toLowerCase() === 'miao-yunzai') return 'Mian-Yunzai';
  if (name.toLowerCase() === 'trss-yunzai') return 'TRSS-Yunzai';
  if (name.toLowerCase() === 'yunzai') return 'Yunzai';

  // 通用规则：将连字符拆分，每段首字母大写，其余小写
  return name.split('-').map((word, index) => {
    // trss、miao 等特定缩写单独处理
    if (word.toLowerCase() === 'trss') return 'TRSS';
    if (word.toLowerCase() === 'miao') return 'Mian';
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  }).join('-');
}

export class HelpYunzai extends plugin {
  constructor() {
    super({
      name: 'fufu菜单',
      dsc: 'fufu菜单',
      event: 'message',
      priority: -99,
      rule: [
        {
          reg: /^(\/|#)?(fufu|fu|芙|芙芙)(帮助|命令|菜单|help|功能|指令)$/i,
          fnc: 'showHelp',
        }
      ]
    });
  }

  // 下载头像
  async downloadAvatar(url) {
    try {
      const res = await axios.get(url, { responseType: 'arraybuffer' });
      const ext = url.endsWith('.png') ? 'png' : 'jpg';
      const filePath = path.resolve('./plugins/fufu-plugin/data/avatar.' + ext);
      fs.writeFileSync(filePath, res.data);
      return filePath;
    } catch {
      return '';
    }
  }

  // 将 RGB 转换为 HEX
  rgbToHex(rgb) {
    return '#' + rgb.map(x => x.toString(16).padStart(2, '0')).join('');
  }

  /** 获取版本信息 */
  getVersionInfo() {
    let yunzai_name = '';
    let yunzai_ver = '';
    let ver = '';

    try {
      // 读取 package.json
      const pkgPath = path.resolve('./package.json');
      if (fs.existsSync(pkgPath)) {
        const packageJson = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        yunzai_name = packageJson.name || yunzai_name;
        yunzai_ver = packageJson.version || yunzai_ver;
      }

      // 读取 CHANGELOG.md 只取最新一行版本号
      const logPath = path.resolve('./plugins/fufu-plugin/CHANGELOG.md');
      if (fs.existsSync(logPath)) {
        const logContent = fs.readFileSync(logPath, 'utf-8');
        const match = logContent.match(/^#+\s*\[?v?([\d.]+)\]?/m);
        if (match) ver = match[1];
      }
    } catch (err) {
      logger.warn('[helpyunzai] 读取版本信息失败', err);
    }

    return { yunzai_name, yunzai_ver, ver };
  }

  // 显示帮助菜单
  async showHelp(e) {
    try {
      const htmlPath = path.resolve('./plugins/fufu-plugin/resources/help.html');
      const jsonPath = path.resolve('./plugins/fufu-plugin/data/commands.json');

      let htmlContent = fs.readFileSync(htmlPath, 'utf-8');
      const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));

      const isQQbot = e.bot?.version?.name === 'QQBot';
      const openid = e.raw?.author?.user_openid || e.raw?.sender?.user_openid || e.user_id;
      const avatarUrl = isQQbot
        // 如果是QQbot使用，请把102808311替换成自己bot的appid
        ? `https://thirdqq.qlogo.cn/qqapp/102808311/${openid}/640`
        : `http://q1.qlogo.cn/g?b=qq&nk=${e.user_id}&s=640`;

      const avatarPath = await this.downloadAvatar(avatarUrl);

      let mainColor = '#57caff';//默认颜色
      let avatarBase64 = '';
      if (avatarPath) {
        avatarBase64 = `data:image/png;base64,${fs.readFileSync(avatarPath).toString('base64')}`;
        try {
          const rgb = await ColorThief.getColor(avatarPath);
          mainColor = this.rgbToHex(rgb);
        } catch {}
      }

      const titleText = e.isMaster
        ? (data.titles?.master || 'BotDashboard')
        : (data.titles?.normal || 'BotHelp');

      const filteredSections = (data.sections || []).filter(sec => !sec.isAdmin || e.isMaster);

      // === 获取版本信息 ===
      const { yunzai_name, yunzai_ver, ver } = this.getVersionInfo();

      // 格式化插件名称
      const formattedYunzaiName = formatPluginName(yunzai_name);

      const commandsData = {
        ...data,
        title: titleText,
        avatar: avatarBase64,
        isMaster: e.isMaster,
        sections: filteredSections,
        mainColor,
        yunzai_name: formattedYunzaiName, // 使用格式化后的插件名称
        yunzai_ver,
        ver
      };

      htmlContent = htmlContent.replace(
        '</body>',
        `<script>window.commandsData = ${JSON.stringify(commandsData)};</script>
         <script>
           document.addEventListener('DOMContentLoaded', () => {
             if(typeof renderCommands==='function'){ renderCommands() }
           })
         </script>
        </body>`
      );

      const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
      const page = await browser.newPage();
      await page.setViewport({ width: 600, height: 900 });
      await page.setContent(htmlContent, { waitUntil: 'domcontentloaded', timeout: 0 });

      await page.waitForFunction(() => {
        const grids = document.querySelectorAll('.command-grid');
        return grids.length > 0 && Array.from(grids).every(g => g.children.length > 0);
      }, { timeout: 10000 });

      const element = await page.$('body');
      const buffer = await element.screenshot({ type: 'png' });
      await browser.close();

      const base64Img = 'base64://' + buffer.toString('base64');
      await e.reply(segment.image(base64Img));
    } catch (err) {
      logger.error('生成帮助图片失败：', err);
      await e.reply('生成帮助图片失败');
    }
  }
}
