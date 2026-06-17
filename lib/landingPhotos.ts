import type { StaticImageData } from "next/image";
import photo1 from "@/assets/landing/1.jpg";
import photo2 from "@/assets/landing/2.jpg";
import photo3 from "@/assets/landing/3.jpg";
import photo4 from "@/assets/landing/4.jpg";
import photo5 from "@/assets/landing/5.jpg";
import photo6 from "@/assets/landing/6.jpg";
import photo7 from "@/assets/landing/7.jpg";

/** 首页景观轮播：打包进构建产物，不依赖 public/ 与外网 */
export const LANDING_PHOTOS: StaticImageData[] = [
  photo1,
  photo2,
  photo3,
  photo4,
  photo5,
  photo6,
  photo7,
];
