import fs from 'fs';
import path from 'path';

interface SupabaseConfig {
  url: string;
  key: string;
}

// 獲取 Supabase 配置
export async function getSupabaseConfig(): Promise<SupabaseConfig> {
  try {
    const configPath = path.join(process.cwd(), 'supabase_config.json');
    const exists = fs.existsSync(configPath);
    
    if (!exists) {
      // 如果配置文件不存在，返回空配置
      return { url: '', key: '' };
    }
    
    const data = fs.readFileSync(configPath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading Supabase config:', error);
    return { url: '', key: '' };
  }
}

// 保存 Supabase 配置
export async function saveSupabaseConfig(url: string, key: string): Promise<boolean> {
  try {
    const configPath = path.join(process.cwd(), 'supabase_config.json');
    const config = { url, key };
    
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
    console.log('Supabase configuration saved successfully');
    return true;
  } catch (error) {
    console.error('Error saving Supabase config:', error);
    throw error;
  }
}