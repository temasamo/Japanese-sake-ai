import fs from "fs";
import path from "path";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

// .env.local を読み込む
config({ path: path.resolve(process.cwd(), ".env.local") });

// Supabase & OpenAI クライアント設定
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // 削除・挿入するので service_role を使用
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

// Embedding対象テーブル
const TABLE_NAME = "sake_embeddings";

// JSONデータの読込対象
const DATA_DIR = path.join(process.cwd(), "data");

async function insertSakeData(file: string) {
  const filePath = path.join(DATA_DIR, file);
  
  try {
    const raw = fs.readFileSync(filePath, "utf-8").trim();
    if (!raw) {
      console.warn(`⚠️  ${file} は空です。スキップします。`);
      return { skipped: 0, inserted: 0 };
    }
    const sakes = JSON.parse(raw);
    if (!Array.isArray(sakes) || sakes.length === 0) {
      console.warn(`⚠️  ${file} にデータがありません。スキップします。`);
      return { skipped: 0, inserted: 0 };
    }

  let skipped = 0;
  let inserted = 0;

  for (const sake of sakes) {
    // 重複チェック: 既に登録されているか確認
    const { data: existing } = await supabase
      .from(TABLE_NAME)
      .select("id")
      .eq("brand_name", sake.brand_name)
      .eq("product_name", sake.product_name)
      .limit(1);

    if (existing && existing.length > 0) {
      skipped++;
      console.log(`⏭️  スキップ（既存）: ${sake.brand_name} (${sake.region})`);
      continue;
    }

    const text = `
      ${sake.brand_name} ${sake.product_name}
      種類: ${sake.type}
      地域: ${sake.region}
      香り: ${sake.flavor_notes.aroma}
      味わい: ${sake.flavor_notes.palate}
      余韻: ${sake.flavor_notes.finish}
      印象: ${sake.flavor_notes.impression}
    `;

    const embedding = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: text,
    });

    const vector = embedding.data[0].embedding;

    const { error } = await supabase.from(TABLE_NAME).insert({
      brand_name: sake.brand_name,
      product_name: sake.product_name,
      type: sake.type,
      region: sake.region,
      region_tag: sake.region_tag,
      flavor_notes: sake.flavor_notes,
      taste_score: sake.taste_score,
      aroma_score: sake.aroma_score,
      embedding: vector,
    });

    if (error) {
      console.error(`❌ ${sake.brand_name} の登録失敗:`, error);
    } else {
      inserted++;
      console.log(`✅ 登録完了: ${sake.brand_name} (${sake.region})`);
    }
  }

  console.log(`📊 ${file}: 新規登録 ${inserted}件, スキップ ${skipped}件`);
  return { skipped, inserted };
  } catch (error) {
    console.error(`❌ ${file} の読み込みに失敗:`, error);
    return { skipped: 0, inserted: 0 };
  }
}

async function main() {
  console.log("🍶 sake_embeddings 登録を開始します...");

  // 挿入したいファイル一覧
  const files = [
    "sake_list_east_part1_hokkaido.json",
    "sake_list_east_part2_tohokuA.json",
    "sake_list_east_part3_tohokuB.json",
    "sake_list_east_part4_kanto.json",
    "sake_list_east_part5_koshinetsu.json",
    "sake_list_east_part6_hokuriku.json",
    "sake_list_west_part1_kinki.json",
    "sake_list_west_part2_chugoku.json",
    "sake_list_west_part3_shikoku.json",
    "sake_list_west_part4_kyushu.json",
    "sake_list_west_part5_okinawa.json",
    "sake_list_yamagata.json"
  ];

  let totalSkipped = 0;
  let totalInserted = 0;

  for (const file of files) {
    console.log(`📄 処理中: ${file}`);
    const result = await insertSakeData(file);
    if (result) {
      totalSkipped += result.skipped;
      totalInserted += result.inserted;
    }
  }

  console.log("\n🎉 すべてのデータ登録が完了しました！");
  console.log(`📊 合計: 新規登録 ${totalInserted}件, スキップ（既存） ${totalSkipped}件`);
  console.log(`💰 コスト: 新規登録分のみ OpenAI Embedding API を呼び出しました`);
}

main();
