/**
 * K12 真实内容知识库 · 小学必背古诗
 * ================================
 *
 * 原文**一字不改**。课文原文错一个字都是事故。
 *
 * 每一首提供四样东西：
 *
 * - ``lines`` —— 分句原文（用于分句图解互动）；
 * - ``plain`` —— 每句的白话（用于「点击高亮看释义」）；
 * - ``en`` —— 每句的英文提示（海外华人学生的对照锚点）；
 * - 作者与朝代（用于铭牌展示）。
 */


/** 部编版 1–6 年级出现过的必背古诗（含常见课后拓展篇目）。 */
export const POEMS = [
  {
    title: "春",
    author: "朱自清",
    dynasty: "现代",
    lines: ["盼望着，盼望着，东风来了", "春天的脚步近了"],
    plain: [
      "盼着盼着，春天就来了——「盼望着」连用两次，把孩子等春天的心情写活了。",
      "春天的脚步近了：用「脚步」拟人，春天像一个走近的人。",
    ],
    en: [
      "Waiting, waiting — the east wind has come.",
      "Spring's footsteps are drawing near.",
    ],
  },
  {
    title: "咏鹅",
    author: "骆宾王",
    dynasty: "唐",
    lines: ["鹅，鹅，鹅", "曲项向天歌", "白毛浮绿水", "红掌拨清波"],
    plain: [
      "连用三个「鹅」——是孩子看到鹅时的欢呼，也是全诗的节奏起点。",
      "弯着脖子朝天叫：一只鹅最鲜明的姿态，先写「向天歌」的昂扬。",
      "白毛浮在绿水上：白与绿相映，是最经典的颜色对比。",
      "红脚掌拨动清波：「拨」是动词，把静态的鹅写成动态的。",
    ],
    en: [
      "Goose, goose, goose.",
      "Its curved neck sings toward the sky.",
      "White feathers float on green water.",
      "Red webbed feet stir the clear ripples.",
    ],
  },
  {
    title: "静夜思",
    author: "李白",
    dynasty: "唐",
    lines: ["床前明月光", "疑是地上霜", "举头望明月", "低头思故乡"],
    plain: [
      "床前洒满明亮的月光——一个「明」字定下全诗的清冷色调。",
      "好像是地上结的霜：把光比作霜，用「疑」写出看错的瞬间。",
      "抬起头望着明月：动作转折，从写景进入抒情。",
      "低下头思念故乡：与「举头」相对，一抬一低之间是完整的思念。",
    ],
    en: [
      "Moonlight spills before my bed.",
      "It seems like frost on the ground.",
      "I lift my head to gaze at the moon.",
      "Then I lower it and think of home.",
    ],
  },
  {
    title: "春晓",
    author: "孟浩然",
    dynasty: "唐",
    lines: ["春眠不觉晓", "处处闻啼鸟", "夜来风雨声", "花落知多少"],
    plain: [
      "春天睡得香，不知不觉天亮了——「不觉」是全诗的关键词。",
      "到处都听见鸟叫：用听觉写春，用「处处」写广度。",
      "昨天夜里传来风雨声：由醒转忆，视线回到昨夜。",
      "不知有多少花被吹落：一个问句，把惜春之情留在纸外。",
    ],
    en: [
      "I slept in spring and never heard the dawn.",
      "Birds call everywhere around.",
      "Last night the wind and rain had come —",
      "How many blossoms must have fallen?",
    ],
  },
  {
    title: "村居",
    author: "高鼎",
    dynasty: "清",
    lines: ["草长莺飞二月天", "拂堤杨柳醉春烟", "儿童散学归来早", "忙趁东风放纸鸢"],
    plain: [
      "二月里草长莺飞：一句把整个春天的时间与声音都装下。",
      "杨柳轻拂堤岸，醉在春天的烟雾里：「醉」把柳写成了人。",
      "孩子们放学回来得早：「早」字暗示他们有整整一个下午。",
      "赶忙趁着东风放风筝：一个「忙」字，全是孩子的急切。",
    ],
    en: [
      "In the second month, grass grows and orioles fly.",
      "Willows by the bank, drunk in spring mist.",
      "Children come home from school early —",
      "hurrying to fly kites on the east wind.",
    ],
  },
  {
    title: "所见",
    author: "袁枚",
    dynasty: "清",
    lines: ["牧童骑黄牛", "歌声振林樾", "意欲捕鸣蝉", "忽然闭口立"],
    plain: [
      "牧童骑在黄牛背上：一个「骑」字写出了自在。",
      "歌声在树林里回荡：「振」是振动，让声音有了空间感。",
      "忽然想捉那只鸣蝉：一句一转，童心毕露。",
      "忽然闭口站住：从动到静的瞬间转折，是全诗最妙的一笔。",
    ],
    en: [
      "The herdsman rides a yellow ox.",
      "His song shakes the woodland.",
      "He wants to catch the singing cicada —",
      "then suddenly stops and stands still.",
    ],
  },
  {
    title: "小池",
    author: "杨万里",
    dynasty: "宋",
    lines: ["泉眼无声惜细流", "树阴照水爱晴柔", "小荷才露尖尖角", "早有蜻蜓立上头"],
    plain: [
      "泉眼悄无声息地流出细流：「惜」字拟人，泉水像舍不得。",
      "树荫倒映水面，喜爱这晴天的柔和：「爱」再次拟人。",
      "小荷叶刚露出尖尖的角：「才露」写出初生的稚嫩。",
      "早就有蜻蜓落在上面：「早有」与「才露」呼应，动与静同时发生。",
    ],
    en: [
      "The spring's eye trickles silently, sparing its stream.",
      "Tree shade falls on water, loving the soft clear day.",
      "A tiny lotus leaf just shows its pointed tip —",
      "and a dragonfly already rests upon it.",
    ],
  },
  {
    title: "池上",
    author: "白居易",
    dynasty: "唐",
    lines: ["小娃撑小艇", "偷采白莲回", "不解藏踪迹", "浮萍一道开"],
    plain: [
      "小孩子撑着小船：一个「撑」字写出孩子的费力与认真。",
      "偷偷采了白莲回来：「偷」字一点也不贬义，反而可爱。",
      "他不懂得藏起自己的踪迹：「不解」是全诗的转折点。",
      "水面的浮萍被划开一道痕：用一个可见的痕迹，把「偷」的证据抖出来。",
    ],
    en: [
      "A small boy poles his little boat.",
      "He sneaks back with a white lotus.",
      "He doesn't know how to hide his tracks —",
      "the duckweed parts in one long line.",
    ],
  },
  {
    title: "赠汪伦",
    author: "李白",
    dynasty: "唐",
    lines: ["李白乘舟将欲行", "忽闻岸上踏歌声", "桃花潭水深千尺", "不及汪伦送我情"],
    plain: [
      "我正要乘船离开：一个「将」字写出离别的将启未启。",
      "忽然听见岸上传来踏歌的声音：「忽闻」是意外的惊喜。",
      "桃花潭的水有千尺深：用具体的深度写友情。",
      "也比不上汪伦送我的情深：用「水」与「情」作比，把抽象变具体。",
    ],
    en: [
      "I was about to board my boat.",
      "Then foot-stamping songs rose from the shore.",
      "The Peach Blossom Pool is a thousand feet deep —",
      "yet not as deep as Wang Lun's farewell.",
    ],
  },
  {
    title: "望庐山瀑布",
    author: "李白",
    dynasty: "唐",
    lines: ["日照香炉生紫烟", "遥看瀑布挂前川", "飞流直下三千尺", "疑是银河落九天"],
    plain: [
      "阳光照在香炉峰升起紫色烟雾：颜色先入画。",
      "远远望去瀑布像挂在山前的白练：一个「挂」字化动为静。",
      "飞流直下三千尺：夸张到极处，气势全开。",
      "好像是银河从九天落下来：用「疑」把真实变成想象。",
    ],
    en: [
      "Sunlight on Cangling Peak raises purple mist.",
      "From afar the waterfall hangs before the stream.",
      "It plunges straight down three thousand feet —",
      "as if the Milky Way fell from the ninth heaven.",
    ],
  },
  {
    title: "绝句",
    author: "杜甫",
    dynasty: "唐",
    lines: ["两个黄鹂鸣翠柳", "一行白鹭上青天", "窗含西岭千秋雪", "门泊东吴万里船"],
    plain: [
      "两只黄鹂在翠柳间鸣叫：黄与翠，颜色对比极鲜亮。",
      "一行白鹭飞上青天：白与青，又是另一组对比。",
      "窗口框住西岭的千年积雪：「含」字把窗变成了画框。",
      "门前停着要去万里东吴的船：以「泊」写静，以「万里」写远。",
    ],
    en: [
      "Two orioles sing among emerald willows.",
      "A row of egrets rises into the blue.",
      "The window frames the west ridge's ancient snow.",
      "At the gate lie boats bound for distant Wu.",
    ],
  },
  {
    title: "晓出净慈寺送林子方",
    author: "杨万里",
    dynasty: "宋",
    lines: ["毕竟西湖六月中", "风光不与四时同", "接天莲叶无穷碧", "映日荷花别样红"],
    plain: [
      "到底是六月里的西湖：先给出时间和地点。",
      "风光和别的季节都不一样：一句总括，为后两句蓄势。",
      "荷叶一直连到天边，无边碧绿：从大处落笔。",
      "荷花映着太阳，别样红：从大处收到小处，色彩浓烈。",
    ],
    en: [
      "After all, this is the West Lake in June.",
      "Its light differs from every other season.",
      "Lotus leaves stretch to the sky, endlessly green.",
      "Lotus flowers blaze in the sun, redder than ever.",
    ],
  },
  {
    title: "江雪",
    author: "柳宗元",
    dynasty: "唐",
    lines: ["千山鸟飞绝", "万径人踪灭", "孤舟蓑笠翁", "独钓寒江雪"],
    plain: [
      "千座山里连鸟都飞绝了：写「静」，用「绝」。",
      "万条路上连人的脚印都没有：写「静」，用「灭」。",
      "只有一只小船，一个披蓑戴笠的老翁：写「孤」。",
      "独自在寒冷的江雪中垂钓：写「独」。四句首字连起来是「千万孤独」。",
    ],
    en: [
      "In a thousand mountains no birds fly.",
      "On ten thousand paths no footprints remain.",
      "A lone boat, a straw-caped old man —",
      "fishing alone in the cold river snow.",
    ],
  },
  {
    title: "寻隐者不遇",
    author: "贾岛",
    dynasty: "唐",
    lines: ["松下问童子", "言师采药去", "只在此山中", "云深不知处"],
    plain: [
      "在松树下问那个小童子：一句交代地点与人物。",
      "他说师父采药去了：童子的回答，间接引出隐者。",
      "就在这座山里：进一步的信息。",
      "可是云太深，不知道具体在哪儿：三问三答，诗戛然而止。",
    ],
    en: [
      "I asked a boy beneath the pines.",
      "\"My master went to gather herbs.\"",
      "\"He is somewhere on this mountain.\"",
      "\"But the clouds are deep — I don't know where.\"",
    ],
  },
  {
    title: "悯农",
    author: "李绅",
    dynasty: "唐",
    lines: ["锄禾日当午", "汗滴禾下土", "谁知盘中餐", "粒粒皆辛苦"],
    plain: [
      "正午顶着太阳锄地：「日当午」三个字就是烈日。",
      "汗水滴进禾苗下的土里：一个「滴」字见分量。",
      "谁知道盘子里的饭：一句反问，把读者拉进画面。",
      "每一粒都饱含辛苦：用「粒粒皆辛苦」收束，朴素有力。",
    ],
    en: [
      "At noon I hoe the grain under blazing sun.",
      "Sweat drips into the earth below.",
      "Who knows the rice upon the plate —",
      "every grain of it was earned in pain.",
    ],
  },
  {
    title: "山行",
    author: "杜牧",
    dynasty: "唐",
    lines: ["远上寒山石径斜", "白云生处有人家", "停车坐爱枫林晚", "霜叶红于二月花"],
    plain: [
      "沿着弯斜的石径远上深秋的山：一条路把空间拉开。",
      "白云升起的地方竟然住着人家：一个转折的意外。",
      "停下车来是因为爱这傍晚的枫林：「坐」字写出观赏的从容。",
      "经霜的枫叶比二月的春花还红：以春花衬秋叶，颜色对比达到极致。",
    ],
    en: [
      "A stone path winds up the cold mountain.",
      "White clouds rise where a cottage hides.",
      "I halt my cart to love the evening maples —",
      "frost-touched leaves are redder than spring blossoms.",
    ],
  },
  {
    title: "赠刘景文",
    author: "苏轼",
    dynasty: "宋",
    lines: ["荷尽已无擎雨盖", "菊残犹有傲霜枝", "一年好景君须记", "最是橙黄橘绿时"],
    plain: [
      "荷花谢了，连遮雨的荷叶都没有了：写秋。",
      "菊花残了，却还有傲霜的枝干：写秋，但更有骨气。",
      "一年中最好的景致你一定要记住：一句转成对朋友的提醒。",
      "正是橙黄橘绿的时节：不写悲秋，反写秋的丰美。",
    ],
    en: [
      "The lotus is gone, no canopy remains.",
      "The chrysanthemum fades but keeps a frost-bold branch.",
      "Remember the finest hour of the year —",
      "when oranges glow and tangerines are green.",
    ],
  },
  {
    title: "夜书所见",
    author: "叶绍翁",
    dynasty: "宋",
    lines: ["萧萧梧叶送寒声", "江上秋风动客情", "知有儿童挑促织", "夜深篱落一灯明"],
    plain: [
      "梧桐叶沙沙作响送来寒意：声音开篇，季节先到。",
      "江上的秋风勾起我的思乡之情：「客情」是全诗的情感核心。",
      "知道有孩子在捉蟋蟀：一句写别人的童年，反衬自己的孤单。",
      "夜深了篱笆边还亮着一盏灯：那盏灯就是孩子的，也是诗人的一点慰藉。",
    ],
    en: [
      "Rustling paulownia leaves bring the cold.",
      "Autumn wind on the river stirs a traveler's heart.",
      "I know a child is hunting crickets there —",
      "one lamp still burning by the fence in the deep night.",
    ],
  },
  {
    title: "九月九日忆山东兄弟",
    author: "王维",
    dynasty: "唐",
    lines: ["独在异乡为异客", "每逢佳节倍思亲", "遥知兄弟登高处", "遍插茱萸少一人"],
    plain: [
      "独自在他乡做一个客人：「独」「异」两字写尽孤独。",
      "每到节日就加倍思念亲人：「倍」字是全诗的情感强度所在。",
      "远远知道兄弟们正在登高：「遥知」是想象的妙处。",
      "大家都插了茱萸却少了我：一个细节，把缺席写成了在场。",
    ],
    en: [
      "Alone in a strange land, a stranger still,",
      "at festival times I miss my kin more.",
      "Far away I know my brothers climb the heights,",
      "planting dogwood — one member missing.",
    ],
  },
  {
    title: "望天门山",
    author: "李白",
    dynasty: "唐",
    lines: ["天门中断楚江开", "碧水东流至此回", "两岸青山相对出", "孤帆一片日边来"],
    plain: [
      "天门山从中断开，让楚江奔流而过：山被写活了。",
      "碧绿的江水东流到这里回旋：一个「回」字写出江势。",
      "两岸青山相对着扑面而来：「出」字化静为动。",
      "一片孤帆从日边驶来：从大景收到一点，构图讲究。",
    ],
    en: [
      "Heaven's Gate splits open; the Chu River pours through.",
      "Blue water swirls back where it meets the gate.",
      "Green peaks on both banks rise to meet us —",
      "a single sail comes from the edge of the sun.",
    ],
  },
  {
    title: "饮湖上初晴后雨",
    author: "苏轼",
    dynasty: "宋",
    lines: ["水光潋滟晴方好", "山色空蒙雨亦奇", "欲把西湖比西子", "淡妆浓抹总相宜"],
    plain: [
      "晴天时西湖水波闪动，正好看：「方好」是明确的赞美。",
      "雨中山色迷蒙，也很奇妙：「亦奇」与上句形成对照。",
      "要是把西湖比作美女西施：一句千古名喻的比喻。",
      "无论淡妆还是浓妆都合适：用妆饰比喻湖的两种美。",
    ],
    en: [
      "Shimmering in sun, the lake is at its best.",
      "Misty in rain, the hills are wonders too.",
      "If West Lake were Lady Xi,",
      "light powder or rich rouge both suit her.",
    ],
  },
  {
    title: "春日",
    author: "朱熹",
    dynasty: "宋",
    lines: ["胜日寻芳泗水滨", "无边光景一时新", "等闲识得东风面", "万紫千红总是春"],
    plain: [
      "风和日丽的日子到泗水边寻春：一个「寻」字写主动。",
      "无边的光景一下子焕然一新：「一时新」是整体感受。",
      "随便就能认出春风的面貌：「等闲」写轻描淡写。",
      "万紫千红处处都是春天：色彩最丰的一句，也是全诗的落点。",
    ],
    en: [
      "On a fine day I seek spring by the Si River.",
      "The boundless scene is suddenly new.",
      "I recognize the east wind at a glance —",
      "a thousand colors are all spring.",
    ],
  },
  {
    title: "游子吟",
    author: "孟郊",
    dynasty: "唐",
    lines: [
      "慈母手中线",
      "游子身上衣",
      "临行密密缝",
      "意恐迟迟归",
      "谁言寸草心",
      "报得三春晖",
    ],
    plain: [
      "慈母手里的针线：一个小物件，写出最深的感情。",
      "是即将远行的孩子身上的衣：针线与游子，一上一下呼应。",
      "临走前一针一线缝得密密的：「密」是动作也是心。",
      "担心孩子很久才回来：「恐」字藏着牵挂。",
      "谁说小草那点心意：比喻，用最卑微的东西作比。",
      "能报答得了整个春天的阳光：春晖比喻母爱，答案是不可能。",
    ],
    en: [
      "In her hand, my mother's needle and thread.",
      "They sew the clothes I will wear away from home.",
      "Before I leave, she stitches them close and tight,",
      "fearing I shall return too late.",
      "Who can say that the heart of tiny grass",
      "could ever repay the spring's full sunlight?",
    ],
  },
  {
    title: "枫桥夜泊",
    author: "张继",
    dynasty: "唐",
    lines: ["月落乌啼霜满天", "江枫渔火对愁眠", "姑苏城外寒山寺", "夜半钟声到客船"],
    plain: [
      "月亮落下，乌鸦啼叫，寒霜仿佛布满天空：三种感觉叠加。",
      "江边的枫树与渔火伴着我这愁人入睡：「愁眠」直接点情。",
      "姑苏城外的寒山寺：地点交代，为末句的钟声做铺垫。",
      "半夜的钟声传到了客船：全诗以「声」收尾，余韵无穷。",
    ],
    en: [
      "The moon has set, crows cry, frost fills the sky.",
      "Maple by the river, fishing lights — I sleep in grief.",
      "At Hanshan Temple beyond Gusu's walls,",
      "the midnight bell reaches my boat.",
    ],
  },
  {
    title: "黄鹤楼送孟浩然之广陵",
    author: "李白",
    dynasty: "唐",
    lines: ["故人西辞黄鹤楼", "烟花三月下扬州", "孤帆远影碧空尽", "唯见长江天际流"],
    plain: [
      "老朋友在西边的黄鹤楼与我告别：「西辞」是地理也是心向。",
      "在繁花似锦的三月顺流东去扬州：时间地点，色彩明丽。",
      "孤船的影子渐渐消失在碧空尽头：「尽」字写出目送之久。",
      "只看见长江浩浩荡荡流向天边：一切景物都成了思念。",
    ],
    en: [
      "My old friend leaves Yellow Crane Tower to the west.",
      "In the flowery third month he sails down to Yangzhou.",
      "His lone sail fades into the blue —",
      "only the Yangtze still flows to the horizon.",
    ],
  },
  {
    title: "早发白帝城",
    author: "李白",
    dynasty: "唐",
    lines: ["朝辞白帝彩云间", "千里江陵一日还", "两岸猿声啼不住", "轻舟已过万重山"],
    plain: [
      "清晨告别彩云环绕的白帝城：一个「彩」字写出仙境。",
      "千里之外的江陵一天就能到达：极言船快。",
      "两岸猿猴的啼声还没停下：声音连续不断，反衬舟行更快。",
      "轻快的小船已经越过了万重山：全诗是「快」，结句最轻快。",
    ],
    en: [
      "At dawn I leave White Emperor amid colored clouds.",
      "A thousand miles to Jiangling in a single day.",
      "The apes' cries still echo on both banks —",
      "my light boat has crossed ten thousand mountains.",
    ],
  },
  {
    title: "题西林壁",
    author: "苏轼",
    dynasty: "宋",
    lines: ["横看成岭侧成峰", "远近高低各不同", "不识庐山真面目", "只缘身在此山中"],
    plain: [
      "横着看是山岭，侧着看是山峰：同一个庐山，角度不同样貌不同。",
      "远看近看高看低看都不一样：四个视角的总结。",
      "认不清庐山的真正面貌：点出「当局者迷」。",
      "只因为自己就在这山里：解释原因，也是哲理。",
    ],
    en: [
      "Seen from the side, a ridge; from the front, a peak.",
      "Near, far, high, low — each view differs.",
      "I cannot see Lushan's true face",
      "because I myself stand within it.",
    ],
  },
  {
    title: "示儿",
    author: "陆游",
    dynasty: "宋",
    lines: ["死去元知万事空", "但悲不见九州同", "王师北定中原日", "家祭无忘告乃翁"],
    plain: [
      "我本来就知道人死之后什么都没有：一句看似绝望的话。",
      "只是悲伤没能看到国家统一：转折——这才是真正的痛点。",
      "朝廷的军队向北收复中原的那一天：一份嘱托。",
      "家祭时别忘了告诉你们的父亲：至死不忘，情感最重处。",
    ],
    en: [
      "I always knew that death empties all things,",
      "yet I grieve that our land is not yet whole.",
      "When the royal armies retake the north,",
      "remember to tell your father at the ancestral rite.",
    ],
  },
  {
    title: "秋夜将晓出篱门迎凉有感",
    author: "陆游",
    dynasty: "宋",
    lines: ["三万里河东入海", "五千仞岳上摩天", "遗民泪尽胡尘里", "南望王师又一年"],
    plain: [
      "三万里长的黄河向东流入大海：数字写河的辽阔。",
      "五千仞高的华山直插云天：数字写山的高度。",
      "沦陷区的百姓在异族统治下把泪都流干了：「泪尽」二字极重。",
      "向南盼望朝廷军队，又盼过了一年：以「又」写重复的失望。",
    ],
    en: [
      "The great Yellow River flows east into the sea.",
      "Mount Hua's five thousand fathoms brush the sky.",
      "The remnant people have wept their tears dry.",
      "Looking south, another year of waiting.",
    ],
  },
  {
    title: "长歌行",
    author: "汉乐府",
    dynasty: "汉",
    lines: [
      "青青园中葵",
      "朝露待日晞",
      "阳春布德泽",
      "万物生光辉",
      "百川东到海",
      "何时复西归",
      "少壮不努力",
      "老大徒伤悲",
    ],
    plain: [
      "园中的葵菜青青翠翠：起景。",
      "早晨的露水等着太阳把它晒干：万物待时的意象。",
      "温暖的春天散布着恩泽：自然界的规律。",
      "万物都焕发出光彩：生机。",
      "所有的河流都向东流入大海：自然规律。",
      "什么时候才能再向西流回来：一句反问，引出哲理。",
      "年轻力壮时不努力：直接的劝勉。",
      "到老了只能白白地伤心：全诗的落脚点。",
    ],
    en: [
      "In the garden, mallows grow green and bright.",
      "Morning dew waits for the sun to dry it.",
      "Spring spreads its bounty; all things shine.",
      "All rivers flow east to the sea —",
      "when will they return flowing west?",
      "If youth goes unused, age will grieve in vain.",
    ],
  },
  {
    title: "敕勒歌",
    author: "北朝民歌",
    dynasty: "南北朝",
    lines: ["敕勒川", "阴山下", "天似穹庐", "笼盖四野", "天苍苍", "野茫茫", "风吹草低见牛羊"],
    plain: [
      "敕勒族生活的川原，在阴山脚下：交代地点。",
      "天空像一顶巨大的圆顶帐篷：「穹庐」是草原特有的居所。",
      "笼罩着四面的原野：把天空写成一个有体积的罩子。",
      "天空湛蓝辽远：叠词写辽阔。",
      "原野茫茫无边：叠词继续加宽。",
      "风吹低了草，就露出了成群的牛羊：前两句的辽阔在此具体化。",
    ],
    en: [
      "The Chiele plain lies beneath Yinshan.",
      "The sky is like a great round tent",
      "covering the wilderness on every side.",
      "The sky is deep blue; the plain is vast —",
      "and as the wind bends the grass, the sheep and cattle appear.",
    ],
  },
  {
    title: "咏柳",
    author: "贺知章",
    dynasty: "唐",
    lines: ["碧玉妆成一树高", "万条垂下绿丝绦", "不知细叶谁裁出", "二月春风似剪刀"],
    plain: [
      "高高的柳树像用碧玉装扮成的：「妆」字写出精心修饰。",
      "千万条柳枝垂下来像绿丝带：「丝绦」是丝织的带子，比喻极贴。",
      "不知这细细的叶子是谁裁出来的：一句转成对造物者的追问。",
      "原来二月的春风就像一把剪刀：把春风比作剪刀，想象奇绝。",
    ],
    en: [
      "Tall as if arrayed in jade,",
      "ten thousand willow strands hang like green silk ribbons.",
      "Who cut these slender leaves?",
      "The February spring wind — a pair of scissors.",
    ],
  },
  {
    title: "回乡偶书",
    author: "贺知章",
    dynasty: "唐",
    lines: ["少小离家老大回", "乡音无改鬓毛衰", "儿童相见不相识", "笑问客从何处来"],
    plain: [
      "年少时离开家，年老了才回来：一句写尽一生。",
      "家乡的口音没变，两鬓的头发却白了：「改」与「衰」对照。",
      "村里的孩子见了我却不认识：陌生的熟悉感。",
      "笑着问「客人您是从哪里来的呀」：全诗最痛的一问。",
    ],
    en: [
      "I left home young; I return old.",
      "My accent is unchanged; my hair has thinned.",
      "The children don't know me.",
      "They ask smiling: \"Where are you from, stranger?\"",
    ],
  },
  {
    title: "凉州词",
    author: "王之涣",
    dynasty: "唐",
    lines: ["黄河远上白云间", "一片孤城万仞山", "羌笛何须怨杨柳", "春风不度玉门关"],
    plain: [
      "黄河好像从白云间奔流而来：把黄河放到极高的位置。",
      "孤零零的城堡矗立在万仞高山之中：极写边塞的孤寂。",
      "羌笛何必吹奏哀怨的《折杨柳》：劝慰也是无奈。",
      "春风都吹不到玉门关外：把边塞的荒远写到了极致。",
    ],
    en: [
      "The Yellow River seems to flow from white clouds.",
      "A lone fortress stands among ten-thousand-fathom peaks.",
      "Why must the flute lament the willows?",
      "Even spring wind never passes Yumen Pass.",
    ],
  },
  {
    title: "出塞",
    author: "王昌龄",
    dynasty: "唐",
    lines: ["秦时明月汉时关", "万里长征人未还", "但使龙城飞将在", "不教胡马度阴山"],
    plain: [
      "还是秦汉时的明月和边关：时间跨越千年，写边塞的古老。",
      "远征万里的将士还没有回来：写征战的漫长。",
      "只要龙城的飞将军还在：用一个历史人物寄托希望。",
      "就不会让敌人的战马越过阴山：把「人」的期待推到顶点。",
    ],
    en: [
      "The same moon and pass as in Qin and Han.",
      "Soldiers sent ten thousand miles have not returned.",
      "If the Flying General of Longcheng still served,",
      "no barbarian horse would pass Yinshan.",
    ],
  },
  {
    title: "芙蓉楼送辛渐",
    author: "王昌龄",
    dynasty: "唐",
    lines: ["寒雨连江夜入吴", "平明送客楚山孤", "洛阳亲友如相问", "一片冰心在玉壶"],
    plain: [
      "寒雨连夜洒满江面，夜里来到吴地：冷色调的送别。",
      "天亮送别友人，只剩楚山孤零零的：山也因离别而孤。",
      "洛阳的亲友如果问起我：托朋友带话的口吻。",
      "就说我的心像玉壶里的冰一样纯洁：冰心玉壶，志向高洁。",
    ],
    en: [
      "Cold rain floods the river; I arrive in Wu by night.",
      "At dawn I send you off; Chu Mountain stands alone.",
      "If friends in Luoyang ask of me,",
      "tell them my heart is ice in a jade vessel.",
    ],
  },
  {
    title: "鹿柴",
    author: "王维",
    dynasty: "唐",
    lines: ["空山不见人", "但闻人语响", "返景入深林", "复照青苔上"],
    plain: [
      "空旷的山里看不见人影：以「不见」写静。",
      "只听见有人说话的声音：以有声写无声，更显其静。",
      "夕阳的余晖射进深深的树林：以光写暗。",
      "又照在青青的苔藓上：光与苔的点染，是一幅极简的画。",
    ],
    en: [
      "In the empty hills, no one is seen.",
      "Only voices drift through.",
      "The sunset reaches deep into the wood",
      "and falls again upon the green moss.",
    ],
  },
  {
    title: "送元二使安西",
    author: "王维",
    dynasty: "唐",
    lines: ["渭城朝雨浥轻尘", "客舍青青柳色新", "劝君更尽一杯酒", "西出阳关无故人"],
    plain: [
      "渭城清晨的细雨润湿了尘土：清新的送别环境。",
      "客舍边的柳色青青一新：「新」字明丽，不作伤别语。",
      "劝你再干了这一杯酒：一句最朴素的深情。",
      "向西出了阳关就再没有老朋友了：结句把不舍全部落在事实陈述上。",
    ],
    en: [
      "Morning rain in Weicheng moistens the dust.",
      "The inn's willows look freshly green.",
      "Please, drink this one more cup —",
      "west of Yangguan, no old friends remain.",
    ],
  },
  {
    title: "登鹳雀楼",
    author: "王之涣",
    dynasty: "唐",
    lines: ["白日依山尽", "黄河入海流", "欲穷千里目", "更上一层楼"],
    plain: [
      "太阳靠着山慢慢落下：白与山，动作极准。",
      "黄河朝着大海奔流：承接上句，空间由近及远。",
      "想要看到千里之外：一句写「站得高」的需要。",
      "那就再登上一层楼：全诗是哲理，也是最著名的励志句。",
    ],
    en: [
      "The sun sinks behind the hills.",
      "The Yellow River flows into the sea.",
      "To see a thousand miles further,",
      "climb one more floor.",
    ],
  },
  {
    title: "浪淘沙",
    author: "刘禹锡",
    dynasty: "唐",
    lines: ["九曲黄河万里沙", "浪淘风簸自天涯", "如今直上银河去", "同到牵牛织女家"],
    plain: [
      "九曲黄河卷着万里泥沙：开篇气势宏大。",
      "波浪淘洗狂风颠簸来自天涯：写黄河的雄浑与来源之远。",
      "如今沿着它直上银河去：想象奇特，气魄极大。",
      "一同到牵牛织女家做客：把人间黄河与天上银河连成一片。",
    ],
    en: [
      "Nine bends of Yellow River, ten thousand miles of sand.",
      "Waves churn, wind shakes — it comes from the world's edge.",
      "Now let me climb the Milky Way",
      "and visit the Cowherd and Weaver Girl.",
    ],
  },
  {
    title: "秋词",
    author: "刘禹锡",
    dynasty: "唐",
    lines: ["自古逢秋悲寂寥", "我言秋日胜春朝", "晴空一鹤排云上", "便引诗情到碧霄"],
    plain: [
      "自古以来人们遇秋就悲叹凄凉：先立一个「共识」。",
      "我却要说秋天胜过春天：一句反其道而行之。",
      "晴空里一只白鹤排开云层直上：意象开阔昂扬。",
      "把我的诗情也引到了碧蓝的天上：把「悲秋」彻底翻转成「壮秋」。",
    ],
    en: [
      "Since olden days, autumn brings mourning and desolation.",
      "I say autumn surpasses spring.",
      "In clear skies a crane pushes through the clouds —",
      "and carries my verse up to the blue heights.",
    ],
  },
  {
    title: "望洞庭",
    author: "刘禹锡",
    dynasty: "唐",
    lines: ["湖光秋月两相和", "潭面无风镜未磨", "遥望洞庭山水翠", "白银盘里一青螺"],
    plain: [
      "湖光与秋月互相映衬：一个「和」字写出和谐。",
      "湖面没有风，像没磨过的铜镜：「未磨」写湖面不甚平滑。",
      "远远望去洞庭的山和水一片青翠：色彩铺开。",
      "白银盘里放着一只青螺：两个比喻把偌大的湖缩成一件工艺品。",
    ],
    en: [
      "Lake light and autumn moon in harmony.",
      "No wind — the surface like an unpolished mirror.",
      "From afar the lake and hills are green —",
      "a jade snail in a silver platter.",
    ],
  },
  {
    title: "竹枝词",
    author: "刘禹锡",
    dynasty: "唐",
    lines: ["杨柳青青江水平", "闻郎江上唱歌声", "东边日出西边雨", "道是无晴却有晴"],
    plain: [
      "杨柳青青，江水平静：一幅明丽的江南春景。",
      "听见心上人在江上唱歌：用声音打破静景。",
      "东边出太阳，西边却下雨：一句写天气，也写心情。",
      "说是无晴却有晴：双关——天气是晴，心中也是晴。",
    ],
    en: [
      "Willows green, the river level.",
      "I hear him singing on the water.",
      "Sun in the east, rain in the west —",
      "they say it isn't clear, yet it is.",
    ],
  },
  {
    title: "独坐敬亭山",
    author: "李白",
    dynasty: "唐",
    lines: ["众鸟高飞尽", "孤云独去闲", "相看两不厌", "只有敬亭山"],
    plain: [
      "群鸟高飞全都走了：鸟的「尽」衬出人的静。",
      "一片孤云也悠然飘去：云与人对照，都写孤独。",
      "彼此看着都不觉得厌：一「相看」把山当作知己。",
      "只有敬亭山还陪着我：以山为友，孤独中见深情。",
    ],
    en: [
      "All the birds have flown high away.",
      "A lone cloud drifts idly off.",
      "We gaze at each other, never tired —",
      "only Mount Jingting and I.",
    ],
  },
  {
    title: "塞下曲",
    author: "卢纶",
    dynasty: "唐",
    lines: ["月黑雁飞高", "单于夜遁逃", "欲将轻骑逐", "大雪满弓刀"],
    plain: [
      "月色昏暗，大雁高飞：环境烘托紧急。",
      "敌人的首领趁夜逃跑了：情节推进。",
      "正要率领轻骑兵去追击：一句蓄势。",
      "大雪已经落满了弓和刀：不写追击结果，用一个意象定格紧张感。",
    ],
    en: [
      "Dark moon, geese fly high.",
      "The chieftain slips away by night.",
      "I will pursue with light cavalry —",
      "snow has covered my bow and saber.",
    ],
  },
  {
    title: "游园不值",
    author: "叶绍翁",
    dynasty: "宋",
    lines: ["应怜屐齿印苍苔", "小扣柴扉久不开", "春色满园关不住", "一枝红杏出墙来"],
    plain: [
      "大概是主人怕木屐踩坏了青苔：一句体贴的猜想。",
      "轻轻敲了半天柴门也没人来：写「访人不遇」。",
      "满园的春色是关不住的：转折，由人转到景。",
      "一枝红杏已经伸出墙外：全诗最妙——用一枝代替了整个春天。",
    ],
    en: [
      "Perhaps he fears the clogs would bruise the moss.",
      "I knock on the gate; no answer comes.",
      "The garden's spring cannot be locked in —",
      "one red apricot branch reaches past the wall.",
    ],
  },
  {
    // ⛔ **合辑条目**——教材里《古诗二首》是一课两首。
    //    这里把《村居》与《咏柳》合成一课，**逐句对应**，
    //    保证题目问到的每一句都是**这一课真实会学的**那一句。
    title: "古诗二首",
    author: "高鼎 · 贺知章",
    dynasty: "清 · 唐",
    lines: [
      "草长莺飞二月天",
      "拂堤杨柳醉春烟",
      "儿童散学归来早",
      "忙趁东风放纸鸢",
      "碧玉妆成一树高",
      "万条垂下绿丝绦",
      "不知细叶谁裁出",
      "二月春风似剪刀",
    ],
    plain: [
      "《村居》——农历二月，青草生长、黄莺飞舞，一句话交代时令与景致。",
      "《村居》——杨柳的枝条拂过堤岸，像沉醉在春天的雾气里；「醉」字把柳写活了。",
      "《村居》——孩子们放学回来得早，「散学」是古词，指放学。",
      "《村居》——赶紧趁着东风把风筝放起来；全诗写的是童年生活的鲜活与自由。",
      "《咏柳》——整棵柳树像用碧玉装扮成的，「碧玉」既写颜色，也写那份润泽的光泽。",
      "《咏柳》——千万条柳枝垂下来，像绿色的丝带；「绿丝绦」三个字把柳条比作丝绸。",
      "《咏柳》——问这些细细的叶子是谁裁出来的？一句问，把咏物变成对话。",
      "《咏柳》——答：二月的春风就像一把剪刀。这是全诗最著名的想象——把无形的春风写成有形的工具。",
    ],
    en: [
      "In the second month of spring, grass grows and orioles fly.",
      "Willows by the bank, drunk in the spring haze.",
      "Children come back from school early today —",
      "hurrying to fly their kites in the east wind.",
      "A tall tree dressed in jade and green.",
      "Ten thousand drooping strands of green silk.",
      "Who cut these slender leaves so fine?",
      "The spring breeze of the second month — a pair of scissors.",
    ],
  },
];

/** 按课文中出现顺序做一次「包含」匹配。 */
export function matchPoem(
  coreTitle,
  fullTitle,
) {
  const needle = String(coreTitle ?? "").replace(/[\s·、，,。:：]/g, "");
  if (!needle) return null;

  // 先精确匹配标题。
  for (const entry of POEMS) {
    const name = entry.title.replace(/[\s·、，,。:：]/g, "");
    if (name === needle) return entry;
  }
  // 再双向包含。
  for (const entry of POEMS) {
    const name = entry.title.replace(/[\s·、，,。:：]/g, "");
    if (needle.includes(name) || name.includes(needle)) return entry;
  }
  // 最后在完整标题里找。
  const haystack = `${coreTitle} ${fullTitle}`;
  for (const entry of POEMS) {
    if (haystack.includes(entry.title)) return entry;
  }
  return null;
}
