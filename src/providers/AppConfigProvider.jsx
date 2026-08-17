import { ConfigProvider, App } from 'antd';
import { useTheme } from './ThemeProvider';
import { lightTheme } from '../theme/lightTheme';
import { darkTheme } from '../theme/darkTheme';
import { componentTheme } from '../theme/componentTheme';

export function AppConfigProvider({ children }) {
  const { theme } = useTheme();

  const isDarkMode = theme === 'dark';
  const baseTheme = isDarkMode ? darkTheme : lightTheme;

  return (
    <ConfigProvider
      theme={{
        algorithm: baseTheme.algorithm,
        token: baseTheme.token,
        components: componentTheme,
      }}
    >
      <App>
        {children}
      </App>
    </ConfigProvider>
  );
}
