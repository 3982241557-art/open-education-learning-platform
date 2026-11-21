import { StreamingCourseLibrary } from "@/components/learning/StreamingCourseLibrary";

/**
 * 课程列表页。
 *
 * 这里展示的是**流媒体公开课**——每一门都能直接播放，带时间戳知识
 * 节点与 AI 伴学，与「公开课」大厅同源。
 *
 * 用户自己导入的文本课程收在页面底部的「我导入的课程」里。
 */
export default function LearningPage() {
  return <StreamingCourseLibrary />;
}
