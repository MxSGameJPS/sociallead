import styles from "./layout.module.css";
import Sidebar from "../../components/dashboard/Sidebar/Sidebar.js";

export default function DashboardLayout({ children }) {
  return (
    <div className={styles.shell}>
      <Sidebar />
      <main className={styles.main}>{children}</main>
    </div>
  );
}