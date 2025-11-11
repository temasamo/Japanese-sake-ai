import fs from "fs";
import path from "path";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

// .env.local を読み込む
config({ path: path.resolve(process.cwd(), ".env.local") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ 環境変数が設定されていません:");
  console.error("   NEXT_PUBLIC_SUPABASE_URL:", supabaseUrl ? "✓" : "✗");
  console.error("   SUPABASE_SERVICE_ROLE_KEY:", supabaseKey ? "✓" : "✗");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function importSakeData() {
  const eastPath = path.resolve("./data/sake_list_east.json");
  const westPath = path.resolve("./data/sake_list_west.json");

  let eastData: any[] = [];
  let westData: any[] = [];

  try {
    const eastContent = fs.readFileSync(eastPath, "utf-8").trim();
    if (eastContent) {
      eastData = JSON.parse(eastContent);
    }
  } catch (error) {
    console.warn("⚠️  east.json の読み込みに失敗または空です:", error);
  }

  try {
    const westContent = fs.readFileSync(westPath, "utf-8").trim();
    if (westContent) {
      westData = JSON.parse(westContent);
    }
  } catch (error) {
    console.warn("⚠️  west.json の読み込みに失敗または空です:", error);
  }

  const allData = [...eastData, ...westData];

  if (allData.length === 0) {
    console.warn("⚠️  登録するデータがありません。JSONファイルにデータを追加してください。");
    return;
  }

  console.log(`📦 ${allData.length} 銘柄をSupabaseに登録します...`);

  for (const sake of allData) {
    const { error } = await supabase.from("sake_embeddings").insert({
      brand_name: sake.brand_name,
      product_name: sake.product_name,
      type: sake.type,
      region: sake.region,
      region_tag: sake.region_tag,
      flavor_notes: sake.flavor_notes,
      taste_score: sake.taste_score,
      aroma_score: sake.aroma_score,
    });

    if (error) {
      console.error(`❌ ${sake.brand_name} の登録に失敗:`, error.message);
    } else {
      console.log(`✅ 登録完了: ${sake.brand_name}`);
    }
  }

  console.log("🎉 全ての日本酒データを登録しました。");
}

importSakeData();
